"""Wealth Intelligence 全局常量与假设口径（Phase 7.1 需求十四/十五）。

所有预测结果都必须显式回传 assumptions，让用户知道「结论基于什么假设」。
"""
from __future__ import annotations

DISCLAIMER = "FinOS AI提供信息分析和辅助决策，不构成投资建议。"
WELCOME_MESSAGE = "欢迎创建你的财富数字分身"

# 与 backend.financial.twin_engine.RISK_EXPECTED_RETURN 保持同一口径
RISK_EXPECTED_RETURN: dict[str, float] = {
    "conservative": 0.03,
    "balanced": 0.05,
    "aggressive": 0.07,
}

# 年化波动率（用于蒙特卡洛与达成概率），按风险偏好区分
RISK_VOLATILITY: dict[str, float] = {
    "conservative": 0.04,
    "balanced": 0.10,
    "aggressive": 0.18,
}

DEFAULT_INFLATION = 0.025           # 年通胀假设
DEFAULT_SALARY_GROWTH = 0.03        # 年收入增长假设
DEFAULT_RETIREMENT_AGE = 60         # 默认退休年龄
DEFAULT_LIFE_EXPECTANCY = 85        # 默认预期寿命（退休资金缺口测算）
DEFAULT_WITHDRAW_RATE = 0.04        # 退休提取率（4% 法则）
MONTE_CARLO_PATHS = 800             # 蒙特卡洛路径数（纯 Python，控制在毫秒级）

PREDICTION_HORIZONS = (1, 3, 5, 10, 20, 30)

# 六维健康评分维度定义（需求六）
SCORE_DIMENSIONS = (
    ("asset", "资产结构"),
    ("cashflow", "现金流"),
    ("risk", "风险控制"),
    ("goal", "目标达成"),
    ("investment", "投资效率"),
    ("protection", "保障水平"),
)

LIABILITY_TYPES = {"liability", "debt", "loan", "mortgage"}
INVESTMENT_TYPES = {"stock", "fund", "bond", "crypto", "gold", "reit"}
PROTECTION_TYPES = {"insurance", "annuity", "pension"}


def assumption_block(
    annual_return: float,
    inflation: float = DEFAULT_INFLATION,
    salary_growth: float = DEFAULT_SALARY_GROWTH,
    extra: dict | None = None,
) -> dict:
    """统一的假设说明块，任何预测结果都必须携带。"""
    data = {
        "annualReturn": round(annual_return, 4),
        "inflation": round(inflation, 4),
        "salaryGrowth": round(salary_growth, 4),
        "note": "以上为模型假设参数，非承诺收益；实际结果受市场、政策与个人行为影响。",
    }
    if extra:
        data.update(extra)
    return data
