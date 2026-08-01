# -*- coding: utf-8 -*-
"""
backend/autonomous/market/providers.py — Phase 7.4 需求六：具体行情 Provider 实现。

  TencentQuoteProvider   腾讯行情（A股/指数），真实数据，3 秒超时
  EastmoneyFundProvider  东方财富基金净值，真实数据
  DeterministicProvider  确定性模拟源（离线兜底）——同一 symbol 永远返回同一序列，
                         便于测试复现；simulated=True，前端会显式标注「降级数据」。

所有网络请求都做超时与异常吞掉处理：拿不到就返回 None/[]，把降级决策交给 manager。
"""
from __future__ import annotations

import hashlib
import json
import logging
import math
import urllib.request
from datetime import datetime, timedelta, timezone

from backend.autonomous.market.base import MarketProvider

logger = logging.getLogger("finos.autonomous.market")

_TIMEOUT = 3.0
_UA = {"User-Agent": "Mozilla/5.0 (compatible; FinOS-AI/7.4)"}


def _http_get(url: str, timeout: float = _TIMEOUT) -> str | None:
    try:
        req = urllib.request.Request(url, headers=_UA)
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310
            raw = resp.read()
        for enc in ("utf-8", "gbk", "gb18030"):
            try:
                return raw.decode(enc)
            except UnicodeDecodeError:
                continue
        return raw.decode("utf-8", errors="ignore")
    except Exception:  # noqa: BLE001
        return None


def normalize_a_share(symbol: str) -> str:
    """把 600000 / 000001 归一化为 sh600000 / sz000001。"""
    s = (symbol or "").strip().lower().replace(".", "")
    if s.startswith(("sh", "sz", "bj", "hk", "us")):
        return s
    if s.endswith("ss"):
        return "sh" + s[:-2]
    if s.endswith("sz"):
        return "sz" + s[:-2]
    if s.isdigit():
        if s.startswith(("6", "5", "9")):
            return "sh" + s
        if s.startswith(("0", "3", "1", "2")):
            return "sz" + s
        if s.startswith(("4", "8")):
            return "bj" + s
    return s


class TencentQuoteProvider(MarketProvider):
    """腾讯行情接口（A股 / 指数 / 港股 / 美股）。"""

    name = "tencent"
    supports = ("stock", "index")
    simulated = False

    def get_price(self, symbol: str, market_type: str = "stock") -> dict | None:
        code = normalize_a_share(symbol)
        text = _http_get(f"http://qt.gtimg.cn/q={code}")
        if not text or "=" not in text:
            return None
        try:
            payload = text.split('="', 1)[1].rstrip('";\n')
            parts = payload.split("~")
            if len(parts) < 33:
                return None
            name = parts[1]
            price = float(parts[3] or 0)
            change_pct = float(parts[32] or 0)
            if price <= 0:
                return None
            return self._quote(code, market_type, price, change_pct, name=name)
        except Exception:  # noqa: BLE001
            return None

    def get_history(self, symbol: str, days: int = 30, market_type: str = "stock") -> list[dict]:
        code = normalize_a_share(symbol)
        url = (
            "http://web.ifzq.gtimg.cn/appstock/app/fqkline/get"
            f"?param={code},day,,,{max(1, min(days, 320))},qfq"
        )
        text = _http_get(url)
        if not text:
            return []
        try:
            data = json.loads(text)
            node = (data.get("data") or {}).get(code) or {}
            rows = node.get("qfqday") or node.get("day") or []
            return [{"date": r[0], "close": float(r[2])} for r in rows if len(r) >= 3]
        except Exception:  # noqa: BLE001
            return []


class EastmoneyFundProvider(MarketProvider):
    """东方财富基金净值接口。"""

    name = "eastmoney"
    supports = ("fund",)
    simulated = False

    def get_price(self, symbol: str, market_type: str = "fund") -> dict | None:
        code = (symbol or "").strip().lstrip("of").zfill(6)[:6]
        text = _http_get(f"http://fundgz.1234567.com.cn/js/{code}.js")
        if not text or "jsonpgz(" not in text:
            return None
        try:
            payload = text.split("jsonpgz(", 1)[1].rstrip(");\n ")
            data = json.loads(payload)
            price = float(data.get("gsz") or data.get("dwjz") or 0)
            change_pct = float(data.get("gszzl") or 0)
            if price <= 0:
                return None
            return self._quote(code, "fund", price, change_pct, name=data.get("name") or code)
        except Exception:  # noqa: BLE001
            return None

    def get_history(self, symbol: str, days: int = 30, market_type: str = "fund") -> list[dict]:
        # 基金历史净值接口不稳定，交由确定性源兜底，避免拖慢自动化任务
        return []


class DeterministicProvider(MarketProvider):
    """确定性模拟源：离线兜底 + 测试可复现（同一 symbol 永远同一序列）。"""

    name = "deterministic"
    supports = ("stock", "fund", "index", "fx")
    simulated = True

    _BASE = {"stock": 18.0, "fund": 1.85, "index": 3400.0, "fx": 7.15}

    def _seed(self, symbol: str, salt: str = "") -> int:
        raw = f"{symbol}|{salt}".encode("utf-8")
        return int(hashlib.sha256(raw).hexdigest()[:12], 16)

    def _base_price(self, symbol: str, market_type: str) -> float:
        base = self._BASE.get(market_type, 10.0)
        offset = (self._seed(symbol) % 1000) / 1000.0
        return round(base * (0.6 + offset * 0.9), 4)

    def get_price(self, symbol: str, market_type: str = "stock") -> dict | None:
        base = self._base_price(symbol, market_type)
        # 以「日」为粒度产生确定性波动，同一天多次调用结果一致
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        seed = self._seed(symbol, day)
        wave = math.sin(seed % 628 / 100.0)
        change_pct = round(wave * 2.4, 4)
        price = round(base * (1 + change_pct / 100.0), 4)
        return self._quote(symbol, market_type, price, change_pct, name=f"{symbol}（模拟）")

    def get_history(self, symbol: str, days: int = 30, market_type: str = "stock") -> list[dict]:
        base = self._base_price(symbol, market_type)
        today = datetime.now(timezone.utc).date()
        out: list[dict] = []
        price = base
        for i in range(max(1, min(days, 365)), 0, -1):
            d = today - timedelta(days=i - 1)
            seed = self._seed(symbol, d.isoformat())
            drift = math.sin(seed % 628 / 100.0) * 0.018
            price = round(max(0.01, price * (1 + drift)), 4)
            out.append({"date": d.isoformat(), "close": price})
        return out


def default_providers() -> list[MarketProvider]:
    """默认 Provider 链：真实源优先，确定性源永远兜底。"""
    return [TencentQuoteProvider(), EastmoneyFundProvider(), DeterministicProvider()]
