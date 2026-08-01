"""财富预测引擎（Phase 7.1 需求二/三）。

能力：
1. 未来 1 / 3 / 5 / 10 / 20 / 30 年资产增长预测（复利 + 收入增长 + 通胀）
2. 现金流预测（收入随薪资增长、支出随通胀）
3. 退休资金测算（4% 法则，给出缺口而非承诺）
4. 财富目标达成概率（蒙特卡洛，固定随机种子 → 结果可复现）
5. Wealth Timeline 财富轨迹（现在 → 5 年 → 10 年 → 目标年龄）

硬性约束：
- 全程零 LLM（成本控制，需求十三）
- 所有结果携带 assumptions（需求十四）
- 结果附 DISCLAIMER（需求十五）
"""
from __future__ import annotations

import hashlib
import math
import random

from backend.intelligence.constants import (
    DEFAULT_INFLATION,
    DEFAULT_LIFE_EXPECTANCY,
    DEFAULT_RETIREMENT_AGE,
    DEFAULT_SALARY_GROWTH,
    DEFAULT_WITHDRAW_RATE,
    DISCLAIMER,
    MONTE_CARLO_PATHS,
    PREDICTION_HORIZONS,
    RISK_VOLATILITY,
    WELCOME_MESSAGE,
    assumption_block,
)
from backend.intelligence.context import WealthContext


# ---------------------------------------------------------------- 基础预测
def predict_net_worth(
    ctx: WealthContext,
    years: int,
    *,
    annual_return: float | None = None,
    inflation: float = DEFAULT_INFLATION,
    salary_growth: float = DEFAULT_SALARY_GROWTH,
) -> list[dict]:
    """逐年推演净资产。返回每一年的 {year, netWorth, income, expense, saving}。"""
    rate = ctx.base_annual_return if annual_return is None else annual_return
    assets = float(ctx.total_assets) - float(ctx.one_off_cost)
    liabilities = float(ctx.total_liabilities)
    income = ctx.monthly_income * 12
    expense = ctx.monthly_expense * 12

    rows: list[dict] = []
    for year in range(1, max(1, years) + 1):
        saving = income - expense
        assets = assets * (1 + rate) + saving
        # 负债按年递减（假设以结余的 20% 优先偿还，最低不为负）
        if liabilities > 0 and saving > 0:
            repay = min(liabilities, saving * 0.2)
            liabilities = round(liabilities - repay, 2)
        rows.append(
            {
                "year": year,
                "netWorth": round(assets - liabilities, 2),
                "totalAssets": round(assets, 2),
                "totalLiabilities": round(liabilities, 2),
                "annualIncome": round(income, 2),
                "annualExpense": round(expense, 2),
                "annualSaving": round(saving, 2),
            }
        )
        income *= 1 + salary_growth
        expense *= 1 + inflation
    return rows


def predict_cashflow(ctx: WealthContext, years: int = 10) -> dict:
    """现金流预测：识别「结余转负」的拐点年份，这是最需要预警的信号。"""
    rows = predict_net_worth(ctx, years)
    negative_year = next((r["year"] for r in rows if r["annualSaving"] < 0), None)
    return {
        "series": [
            {
                "year": r["year"],
                "income": r["annualIncome"],
                "expense": r["annualExpense"],
                "surplus": r["annualSaving"],
            }
            for r in rows
        ],
        "currentMonthlySurplus": ctx.monthly_surplus,
        "breakEvenYear": negative_year,
        "note": (
            f"按当前假设，第 {negative_year} 年起年度结余将转负，需提前调整支出或增加收入。"
            if negative_year
            else "按当前假设，预测期内年度结余持续为正。"
        ),
    }


# ---------------------------------------------------------------- 退休测算
def retirement_projection(
    ctx: WealthContext,
    *,
    retirement_age: int = DEFAULT_RETIREMENT_AGE,
    life_expectancy: int = DEFAULT_LIFE_EXPECTANCY,
    withdraw_rate: float = DEFAULT_WITHDRAW_RATE,
    inflation: float = DEFAULT_INFLATION,
) -> dict:
    """退休资金测算：需要多少 vs 预计有多少 vs 缺口。年龄缺失时明确告知无法测算。"""
    if ctx.age is None:
        return {
            "available": False,
            "reason": "未填写年龄，无法测算退休资金。请在财富档案中补充年龄后重试。",
        }
    years_to_retire = retirement_age - int(ctx.age)
    if years_to_retire <= 0:
        years_to_retire = 0

    # 退休时的年支出（按通胀折算）
    annual_expense_now = ctx.monthly_expense * 12
    annual_expense_at_retire = annual_expense_now * ((1 + inflation) ** years_to_retire)
    retirement_years = max(1, life_expectancy - retirement_age)
    # 需求金额：取「4% 提取率」与「退休年限总支出现值」的较大者，保守口径
    need_by_rule = annual_expense_at_retire / withdraw_rate if withdraw_rate > 0 else 0.0
    need_by_span = annual_expense_at_retire * retirement_years * 0.7  # 考虑退休后支出递减
    required = round(max(need_by_rule, need_by_span), 2)

    projected = (
        round(predict_net_worth(ctx, years_to_retire)[-1]["netWorth"], 2)
        if years_to_retire > 0
        else ctx.net_worth
    )
    gap = round(required - projected, 2)
    monthly_extra = 0.0
    if gap > 0 and years_to_retire > 0:
        rate = ctx.base_annual_return
        # 年金终值公式求解每年需额外储蓄
        factor = (((1 + rate) ** years_to_retire) - 1) / rate if rate > 0 else years_to_retire
        monthly_extra = round(gap / factor / 12, 2)

    return {
        "available": True,
        "currentAge": int(ctx.age),
        "retirementAge": retirement_age,
        "yearsToRetirement": years_to_retire,
        "retirementYears": retirement_years,
        "annualExpenseAtRetirement": round(annual_expense_at_retire, 2),
        "requiredCapital": required,
        "projectedCapital": projected,
        "gap": gap,
        "covered": gap <= 0,
        "extraMonthlySavingNeeded": monthly_extra,
        "withdrawRate": withdraw_rate,
    }


# ---------------------------------------------------------------- 达成概率
def _seed_for(ctx: WealthContext, target: float, years: int) -> int:
    """用 sha256 派生种子（不能用内置 hash：字符串 hash 每进程随机化，结果不可复现）。"""
    raw = f"{ctx.net_worth}|{ctx.annual_saving}|{ctx.risk_level}|{target}|{years}"
    return int(hashlib.sha256(raw.encode("utf-8")).hexdigest()[:8], 16)


def goal_probability(
    ctx: WealthContext,
    target_amount: float | None = None,
    years: int | None = None,
    *,
    paths: int = MONTE_CARLO_PATHS,
) -> dict:
    """蒙特卡洛测算目标达成概率。随机种子由输入派生 → 同输入必得同结果（可复现）。"""
    target = target_amount if target_amount is not None else ctx.goal_amount
    if not target or target <= 0:
        return {
            "available": False,
            "reason": "未设置可量化的财富目标（如「10年内攒够500万」），无法测算达成概率。",
        }
    horizon = years or 10
    horizon = max(1, min(50, horizon))

    mu = ctx.base_annual_return
    sigma = RISK_VOLATILITY.get(ctx.risk_level, 0.10)
    rng = random.Random(_seed_for(ctx, target, horizon))

    success = 0
    finals: list[float] = []
    start = float(ctx.total_assets) - float(ctx.one_off_cost) - float(ctx.total_liabilities)
    saving = ctx.annual_saving
    for _ in range(paths):
        value = start
        annual_saving = saving
        for _y in range(horizon):
            shock = rng.gauss(mu, sigma)
            value = value * (1 + shock) + annual_saving
            annual_saving *= 1 + DEFAULT_SALARY_GROWTH
        finals.append(value)
        if value >= target:
            success += 1
    finals.sort()

    def pct(p: float) -> float:
        idx = min(len(finals) - 1, max(0, int(len(finals) * p)))
        return round(finals[idx], 2)

    prob = round(success / paths, 4)
    return {
        "available": True,
        "targetAmount": round(float(target), 2),
        "horizonYears": horizon,
        "probability": prob,
        "probabilityLabel": _prob_label(prob),
        "percentile10": pct(0.10),
        "percentile50": pct(0.50),
        "percentile90": pct(0.90),
        "paths": paths,
        "volatility": sigma,
        "method": "Monte Carlo（对数正态收益近似，固定种子可复现）",
    }


def _prob_label(p: float) -> str:
    if p >= 0.8:
        return "很可能达成"
    if p >= 0.6:
        return "较可能达成"
    if p >= 0.4:
        return "存在不确定性"
    if p >= 0.2:
        return "达成难度较大"
    return "按当前节奏难以达成"


# ---------------------------------------------------------------- 财富轨迹
def build_timeline(ctx: WealthContext, rows: list[dict], retirement: dict) -> list[dict]:
    """Wealth Timeline：现在 → 5 年 → 10 年 → 目标/退休年龄。"""
    by_year = {r["year"]: r for r in rows}
    timeline: list[dict] = [
        {
            "stage": "现在",
            "yearOffset": 0,
            "age": ctx.age,
            "netWorth": ctx.net_worth,
            "description": "当前财富数字分身的真实净值",
        }
    ]
    for offset, label in ((5, "5 年后"), (10, "10 年后")):
        row = by_year.get(offset)
        if row:
            timeline.append(
                {
                    "stage": label,
                    "yearOffset": offset,
                    "age": (ctx.age + offset) if ctx.age is not None else None,
                    "netWorth": row["netWorth"],
                    "description": f"按年化 {ctx.base_annual_return:.1%} 与当前储蓄节奏推演",
                }
            )
    if retirement.get("available"):
        yrs = retirement["yearsToRetirement"]
        timeline.append(
            {
                "stage": f"{retirement['retirementAge']} 岁退休",
                "yearOffset": yrs,
                "age": retirement["retirementAge"],
                "netWorth": retirement["projectedCapital"],
                "required": retirement["requiredCapital"],
                "gap": retirement["gap"],
                "description": (
                    "预计可覆盖退休所需"
                    if retirement["covered"]
                    else f"预计缺口 ¥{retirement['gap']:,.0f}，需每月额外储蓄 ¥{retirement['extraMonthlySavingNeeded']:,.0f}"
                ),
            }
        )
    return timeline


# ---------------------------------------------------------------- 总入口
def predict_wealth(
    ctx: WealthContext,
    *,
    horizons: tuple[int, ...] = PREDICTION_HORIZONS,
    retirement_age: int = DEFAULT_RETIREMENT_AGE,
    goal_amount: float | None = None,
    goal_years: int | None = None,
) -> dict:
    """预测总入口：资产增长 + 现金流 + 退休 + 目标概率 + Timeline。"""
    if not ctx.has_data:
        return {"hasData": False, "message": WELCOME_MESSAGE, "disclaimer": DISCLAIMER}

    max_year = max(horizons)
    rows = predict_net_worth(ctx, max_year)
    by_year = {r["year"]: r for r in rows}
    milestones = [
        {
            "year": y,
            "netWorth": by_year[y]["netWorth"],
            "totalAssets": by_year[y]["totalAssets"],
            "annualSaving": by_year[y]["annualSaving"],
        }
        for y in horizons
        if y in by_year
    ]
    retirement = retirement_projection(ctx, retirement_age=retirement_age)
    goal = goal_probability(ctx, goal_amount, goal_years or _infer_goal_years(ctx))
    cashflow = predict_cashflow(ctx, min(10, max_year))
    timeline = build_timeline(ctx, rows, retirement)

    return {
        "hasData": True,
        "current": ctx.to_dict(),
        "milestones": milestones,
        "series": rows,
        "cashflow": cashflow,
        "retirement": retirement,
        "goal": goal,
        "timeline": timeline,
        "assumptions": assumption_block(
            ctx.base_annual_return,
            extra={
                "volatility": RISK_VOLATILITY.get(ctx.risk_level, 0.10),
                "retirementAge": retirement_age,
                "withdrawRate": DEFAULT_WITHDRAW_RATE,
                "model": "确定性复利推演 + 蒙特卡洛概率（零 LLM，纯代码计算）",
            },
        ),
        "disclaimer": DISCLAIMER,
    }


def _infer_goal_years(ctx: WealthContext) -> int:
    from backend.intelligence.context import parse_goal_year

    years = parse_goal_year(ctx.goal_text)
    if years:
        return years
    if ctx.age is not None and ctx.age < DEFAULT_RETIREMENT_AGE:
        return max(1, DEFAULT_RETIREMENT_AGE - int(ctx.age))
    return 10


def compound(value: float, rate: float, years: int) -> float:
    """工具函数：复利终值（供其它子域复用）。"""
    return round(value * math.pow(1 + rate, years), 2)
