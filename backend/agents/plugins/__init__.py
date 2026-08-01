"""内置 Agent 插件（Phase 7.2 需求十）。

新增插件只需：在本目录新建模块 → 在 load_all() 中 import 一次即可自动注册。
"""
from __future__ import annotations


def load_all() -> None:
    """导入所有内置插件，触发 @register 装饰器。"""
    from backend.agents.plugins import (  # noqa: F401
        cashflow,
        insurance,
        investment,
        retirement,
        tax,
    )
