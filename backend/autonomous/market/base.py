# -*- coding: utf-8 -*-
"""
backend/autonomous/market/base.py — Phase 7.4 需求六：市场数据层抽象。

不绑定任何单一数据供应商：所有实现只需满足 MarketProvider 协议，
上层通过 manager 统一调度，任一 Provider 不可用即自动降级到下一个。

统一返回结构（Quote）：
  {"symbol","marketType","price","changePct","currency","provider","asOf","simulated"}
历史（HistoryPoint）：
  {"date","close"}
"""
from __future__ import annotations

import abc
from datetime import datetime, timezone

MARKET_TYPES = ("stock", "fund", "index", "fx")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class MarketProvider(abc.ABC):
    """行情数据源抽象基类。"""

    name: str = "base"
    #: 该 Provider 支持的品种
    supports: tuple[str, ...] = MARKET_TYPES
    #: 是否为模拟数据（用于前端标注「降级」）
    simulated: bool = False

    def can_handle(self, market_type: str) -> bool:
        return market_type in self.supports

    @abc.abstractmethod
    def get_price(self, symbol: str, market_type: str = "stock") -> dict | None:
        """返回最新报价；不可用时返回 None（由 manager 负责降级）。"""

    @abc.abstractmethod
    def get_history(self, symbol: str, days: int = 30, market_type: str = "stock") -> list[dict]:
        """返回最近 N 天的收盘序列；不可用时返回空列表。"""

    # ---- 工具 ----
    def _quote(
        self,
        symbol: str,
        market_type: str,
        price: float,
        change_pct: float,
        currency: str = "CNY",
        name: str = "",
    ) -> dict:
        return {
            "symbol": symbol,
            "name": name or symbol,
            "marketType": market_type,
            "price": round(float(price), 4),
            "changePct": round(float(change_pct), 4),
            "currency": currency,
            "provider": self.name,
            "asOf": now_iso(),
            "simulated": self.simulated,
        }
