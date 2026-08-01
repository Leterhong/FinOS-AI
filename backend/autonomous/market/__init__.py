# -*- coding: utf-8 -*-
"""Phase 7.4 市场数据层（Provider 模式 + 缓存 + 降级）。"""
from backend.autonomous.market.base import MARKET_TYPES, MarketProvider
from backend.autonomous.market.manager import MarketDataManager, get_manager, set_manager
from backend.autonomous.market.providers import (
    DeterministicProvider,
    EastmoneyFundProvider,
    TencentQuoteProvider,
    default_providers,
)

__all__ = [
    "MARKET_TYPES",
    "MarketProvider",
    "MarketDataManager",
    "get_manager",
    "set_manager",
    "DeterministicProvider",
    "EastmoneyFundProvider",
    "TencentQuoteProvider",
    "default_providers",
]
