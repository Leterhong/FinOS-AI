# -*- coding: utf-8 -*-
"""Phase 7.4 自动化智能体：投资 / 现金流 / 偏好学习。"""
from backend.autonomous.agents import cashflow, investment, preference

AGENT_REGISTRY = {
    investment.AGENT_KEY: investment.analyze,
    cashflow.AGENT_KEY: cashflow.analyze,
}

__all__ = ["investment", "cashflow", "preference", "AGENT_REGISTRY"]
