# -*- coding: utf-8 -*-
"""
backend/autonomous/market/manager.py — Phase 7.4 需求六：市场数据统一调度层。

对外仅暴露三个接口（与需求文档一致）：
    get_price(symbol)
    get_history(symbol, days)
    get_portfolio_change()

三层保障：
  1. 缓存优先  —— 命中未过期的 automation_market_cache 直接返回，零网络零 Token；
  2. Provider 链 —— 真实源按顺序尝试，任一成功即写缓存返回；
  3. 降级兜底  —— 全部真实源不可用时切确定性模拟源，结果标注 degraded=True，
                  自动化流程继续跑而不是崩掉（对应验收第 4 项「市场异常时能降级」）。

熔断：某个真实源连续失败 3 次后，冷却 5 分钟内不再尝试，避免离线环境
      每次都空等 3 秒超时把自动化任务拖死。
"""
from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.autonomous.market.base import MarketProvider
from backend.autonomous.market.providers import default_providers
from backend.autonomous.models import AutomationMarketCache
from backend.financial.models import Asset
from backend.user.models import User

logger = logging.getLogger("finos.autonomous.market")

DEFAULT_TTL_SECONDS = 900  # 15 分钟
_BREAKER_THRESHOLD = 3
_BREAKER_COOLDOWN = 300  # 秒

# 资产类型 → 行情品种 / 基准标的
_ASSET_MARKET_TYPE = {"stock": "stock", "fund": "fund", "crypto": "stock"}
_BENCHMARK = {"stock": "sh000300", "fund": "sh000300", "crypto": "sh000300"}


class _Breaker:
    """极简熔断器（进程内）。"""

    def __init__(self) -> None:
        self._fails: dict[str, int] = {}
        self._until: dict[str, float] = {}
        self._lock = threading.Lock()

    def is_open(self, name: str) -> bool:
        with self._lock:
            until = self._until.get(name, 0.0)
            if until and time.time() < until:
                return True
            if until and time.time() >= until:
                self._until.pop(name, None)
                self._fails[name] = 0
            return False

    def record_failure(self, name: str) -> None:
        with self._lock:
            n = self._fails.get(name, 0) + 1
            self._fails[name] = n
            if n >= _BREAKER_THRESHOLD:
                self._until[name] = time.time() + _BREAKER_COOLDOWN

    def record_success(self, name: str) -> None:
        with self._lock:
            self._fails[name] = 0
            self._until.pop(name, None)

    def reset(self) -> None:
        with self._lock:
            self._fails.clear()
            self._until.clear()


class MarketDataManager:
    def __init__(self, providers: list[MarketProvider] | None = None) -> None:
        self.providers = providers or default_providers()
        self.breaker = _Breaker()

    # ------------------------------------------------------------------ #
    # 缓存
    # ------------------------------------------------------------------ #
    def _cache_row(self, db: Session, user_id: str, symbol: str) -> AutomationMarketCache | None:
        stmt = (
            select(AutomationMarketCache)
            .where(AutomationMarketCache.user_id == user_id, AutomationMarketCache.symbol == symbol)
            .limit(1)
        )
        return db.scalar(stmt)

    @staticmethod
    def _expired(row: AutomationMarketCache | None) -> bool:
        if row is None or row.expires_at is None:
            return True
        exp = row.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) >= exp

    # ------------------------------------------------------------------ #
    # 需求六接口 1：get_price
    # ------------------------------------------------------------------ #
    def get_price(
        self,
        db: Session,
        user: User,
        symbol: str,
        market_type: str = "stock",
        *,
        ttl: int = DEFAULT_TTL_SECONDS,
        force: bool = False,
    ) -> dict:
        symbol = (symbol or "").strip()
        if not symbol:
            return {"symbol": "", "price": None, "error": "缺少标的代码", "degraded": True}

        row = self._cache_row(db, user.id, symbol)
        if not force and row is not None and not self._expired(row) and row.price is not None:
            return {
                "symbol": row.symbol,
                "name": row.symbol,
                "marketType": row.market_type,
                "price": row.price,
                "changePct": None,
                "currency": row.currency,
                "provider": row.provider,
                "asOf": row.fetched_at.isoformat() if row.fetched_at else None,
                "cached": True,
                "degraded": row.provider == "deterministic",
            }

        quote: dict | None = None
        tried: list[str] = []
        for p in self.providers:
            if not p.can_handle(market_type):
                continue
            if not p.simulated and self.breaker.is_open(p.name):
                tried.append(f"{p.name}:熔断")
                continue
            try:
                quote = p.get_price(symbol, market_type)
            except Exception:  # noqa: BLE001
                quote = None
            if quote:
                if not p.simulated:
                    self.breaker.record_success(p.name)
                break
            tried.append(f"{p.name}:无数据")
            if not p.simulated:
                self.breaker.record_failure(p.name)

        if not quote:
            return {
                "symbol": symbol,
                "price": None,
                "degraded": True,
                "error": "所有行情源均不可用",
                "tried": tried,
            }

        # 写缓存
        now = datetime.now(timezone.utc)
        if row is None:
            row = AutomationMarketCache(user_id=user.id, symbol=symbol)
            db.add(row)
        row.market_type = market_type
        row.price = quote.get("price")
        row.currency = quote.get("currency", "CNY")
        row.provider = quote.get("provider", "unknown")
        row.fetched_at = now
        row.expires_at = now + timedelta(seconds=max(30, ttl))
        db.commit()

        quote["cached"] = False
        quote["degraded"] = bool(quote.get("simulated"))
        if tried:
            quote["fallbackFrom"] = tried
        return quote

    # ------------------------------------------------------------------ #
    # 需求六接口 2：get_history
    # ------------------------------------------------------------------ #
    def get_history(
        self,
        db: Session,
        user: User,
        symbol: str,
        days: int = 30,
        market_type: str = "stock",
        *,
        ttl: int = DEFAULT_TTL_SECONDS * 4,
    ) -> dict:
        symbol = (symbol or "").strip()
        if not symbol:
            return {"symbol": "", "points": [], "degraded": True, "error": "缺少标的代码"}

        row = self._cache_row(db, user.id, symbol)
        if row is not None and not self._expired(row):
            cached = row.history_list()
            if cached:
                return {
                    "symbol": symbol,
                    "marketType": row.market_type,
                    "points": cached[-days:],
                    "provider": row.provider,
                    "cached": True,
                    "degraded": row.provider == "deterministic",
                }

        points: list[dict] = []
        provider_name = "unknown"
        degraded = False
        for p in self.providers:
            if not p.can_handle(market_type):
                continue
            if not p.simulated and self.breaker.is_open(p.name):
                continue
            try:
                points = p.get_history(symbol, days, market_type)
            except Exception:  # noqa: BLE001
                points = []
            if points:
                provider_name = p.name
                degraded = p.simulated
                if not p.simulated:
                    self.breaker.record_success(p.name)
                break
            if not p.simulated:
                self.breaker.record_failure(p.name)

        if points:
            now = datetime.now(timezone.utc)
            if row is None:
                row = AutomationMarketCache(user_id=user.id, symbol=symbol)
                db.add(row)
            row.market_type = market_type
            row.provider = provider_name
            row.set_history(points)
            row.fetched_at = now
            row.expires_at = now + timedelta(seconds=max(60, ttl))
            db.commit()

        return {
            "symbol": symbol,
            "marketType": market_type,
            "points": points,
            "provider": provider_name,
            "cached": False,
            "degraded": degraded or not points,
        }

    # ------------------------------------------------------------------ #
    # 需求六接口 3：get_portfolio_change
    # ------------------------------------------------------------------ #
    def get_portfolio_change(self, db: Session, user: User) -> dict:
        """按用户实际持仓计算组合层面的行情变化。

        资产名称中含标的代码（如「600000 浦发银行」）时按该代码取价，
        否则用对应基准指数代表其涨跌，保证零持仓代码也能给出方向性判断。
        """
        assets = list(
            db.scalars(
                select(Asset).where(Asset.user_id == user.id, Asset.type.in_(tuple(_ASSET_MARKET_TYPE)))
            ).all()
        )
        if not assets:
            return {
                "hasHoldings": False,
                "totalValue": 0.0,
                "changePct": 0.0,
                "changeAmount": 0.0,
                "items": [],
                "degraded": False,
                "message": "尚未录入股票/基金类资产，暂无组合行情",
            }

        items: list[dict] = []
        total = 0.0
        weighted = 0.0
        degraded_any = False
        for a in assets:
            mtype = _ASSET_MARKET_TYPE.get(a.type, "stock")
            symbol = _extract_symbol(a.name) or _BENCHMARK.get(a.type, "sh000300")
            quote = self.get_price(db, user, symbol, "index" if symbol.startswith("sh000") else mtype)
            change = float(quote.get("changePct") or 0.0)
            amount = float(a.amount or 0.0)
            degraded_any = degraded_any or bool(quote.get("degraded"))
            total += amount
            weighted += amount * change
            items.append(
                {
                    "assetId": a.id,
                    "assetName": a.name,
                    "assetType": a.type,
                    "amount": round(amount, 2),
                    "symbol": symbol,
                    "isBenchmark": _extract_symbol(a.name) is None,
                    "changePct": round(change, 2),
                    "changeAmount": round(amount * change / 100.0, 2),
                    "provider": quote.get("provider"),
                    "degraded": bool(quote.get("degraded")),
                }
            )

        change_pct = round(weighted / total, 4) if total > 0 else 0.0
        return {
            "hasHoldings": True,
            "totalValue": round(total, 2),
            "changePct": change_pct,
            "changeAmount": round(total * change_pct / 100.0, 2),
            "items": items,
            "degraded": degraded_any,
            "message": "部分行情源不可用，已使用降级数据" if degraded_any else "行情获取正常",
        }


def _extract_symbol(name: str | None) -> str | None:
    """从资产名称中提取 6 位 A 股代码或 sh/sz 前缀代码。"""
    if not name:
        return None
    token = ""
    for ch in name:
        if ch.isdigit():
            token += ch
            if len(token) == 6:
                return token
        else:
            token = ""
    lower = name.lower()
    for prefix in ("sh", "sz", "bj"):
        idx = lower.find(prefix)
        if idx >= 0 and lower[idx + 2 : idx + 8].isdigit():
            return lower[idx : idx + 8]
    return None


_manager: MarketDataManager | None = None
_manager_lock = threading.Lock()


def get_manager() -> MarketDataManager:
    global _manager
    if _manager is None:
        with _manager_lock:
            if _manager is None:
                _manager = MarketDataManager()
    return _manager


def set_manager(mgr: MarketDataManager | None) -> None:
    """测试可注入自定义 Provider 链。"""
    global _manager
    _manager = mgr
