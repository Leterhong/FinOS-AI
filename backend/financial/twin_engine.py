"""Financial Twin Engine — 后端化（Phase 7.0.1 需求七）。

从前端迁移的纯代码计算引擎（零 LLM 成本）：
用户数据 → Twin Engine → 净值/配置/储蓄率/健康分/退休预测。

硬性约束：无数据 → hasData=False + 欢迎文案，绝不返回默认/伪造财富数字。
"""
from __future__ import annotations

from backend.financial.models import Asset, FinancialProfile

WELCOME_MESSAGE = "欢迎创建你的财富数字分身"

RISK_EXPECTED_RETURN = {
    "conservative": 0.03,
    "balanced": 0.05,
    "aggressive": 0.07,
}


LIABILITY_TYPES = {"liability", "debt", "loan", "mortgage"}


def compute_twin(profile: FinancialProfile | None, assets: list[Asset]) -> dict:
    """纯代码计算财富数字分身。无数据时返回空状态（需求三）。

    资产类型含负债（liability/debt/loan/mortgage），净值 = 资产 − 负债。
    """
    if profile is None and not assets:
        return {"hasData": False, "message": WELCOME_MESSAGE}

    total_assets = round(sum(a.amount for a in assets if a.type not in LIABILITY_TYPES), 2)
    total_liabilities = round(sum(a.amount for a in assets if a.type in LIABILITY_TYPES), 2)
    net_worth = round(total_assets - total_liabilities, 2)

    # 资产配置占比（以净值为分母，负债为负贡献）
    allocation: dict[str, float] = {}
    for a in assets:
        allocation[a.type] = allocation.get(a.type, 0.0) + a.amount
    allocation_pct = (
        {k: round(v / net_worth, 4) for k, v in allocation.items()}
        if net_worth > 0
        else {k: 0.0 for k in allocation}
    )

    # 现金流与储蓄率
    income = float(profile.income) if profile else 0.0
    expense = float(profile.expense) if profile else 0.0
    monthly_surplus = round(income - expense, 2)
    savings_rate = round(monthly_surplus / income, 4) if income > 0 else 0.0

    # 应急缓冲（月支出覆盖数）
    cash = allocation.get("cash", 0.0)
    emergency_months = round(cash / expense, 1) if expense > 0 else None

    # 健康评分（0-100，纯规则）
    score = 50.0
    if savings_rate >= 0.3:
        score += 20
    elif savings_rate >= 0.1:
        score += 10
    elif income > 0 and savings_rate < 0:
        score -= 15
    if emergency_months is not None:
        if emergency_months >= 6:
            score += 15
        elif emergency_months >= 3:
            score += 8
        elif emergency_months < 1:
            score -= 10
    top_pct = max(allocation_pct.values(), default=0.0)
    if top_pct >= 0.85:
        score -= 15
    elif top_pct >= 0.7:
        score -= 8
    elif 0 < top_pct <= 0.5:
        score += 5
    health_score = max(0, min(100, round(score)))

    # 退休/长期预测（30 年复利，按风险偏好期望收益）
    risk = profile.risk_level if profile else "balanced"
    rate = RISK_EXPECTED_RETURN.get(risk, 0.05)
    projection = []
    value = float(total_assets)
    annual_saving = monthly_surplus * 12
    for year in (5, 10, 20, 30):
        v = float(total_assets)
        for _ in range(year):
            v = v * (1 + rate) + annual_saving
        projection.append({"year": year, "value": round(v, 2)})
    del value

    return {
        "hasData": True,
        "netWorth": net_worth,
        "totalAssets": total_assets,
        "totalLiabilities": total_liabilities,
        "allocation": allocation_pct,
        "monthlyIncome": income,
        "monthlyExpense": expense,
        "monthlySurplus": monthly_surplus,
        "savingsRate": savings_rate,
        "emergencyMonths": emergency_months,
        "healthScore": health_score,
        "riskLevel": risk,
        "goal": profile.goal if profile else None,
        "projection": projection,
        "assumedAnnualReturn": rate,
        "disclaimer": "FinOS AI提供信息分析和辅助决策，不构成投资建议。",
    }
