"""人生事件定义与作用规则（Phase 7.1 需求四）。

支持事件：买房 / 换工作 / 创业 / 结婚 / 生育 / 退休 / 留学 / 自定义。

每个事件只做一件事：接收一个 WealthContext 副本 + 参数，返回被修改后的副本 + 变更说明。
真实 Twin 永远不被污染（clone 语义）。所有默认参数都会在结果里显式回传，
用户可以看到「这个结论是基于什么假设算出来的」（需求十四）。
"""
from __future__ import annotations

from collections.abc import Callable

from backend.intelligence.context import WealthContext

EventHandler = Callable[[WealthContext, dict], tuple[WealthContext, list[str], dict]]


def _f(params: dict, key: str, default: float) -> float:
    try:
        val = params.get(key)
        return float(val) if val is not None else float(default)
    except (TypeError, ValueError):
        return float(default)


def _i(params: dict, key: str, default: int) -> int:
    return int(_f(params, key, default))


# ------------------------------------------------------------------ 买房
def _buy_house(ctx: WealthContext, params: dict) -> tuple[WealthContext, list[str], dict]:
    price = _f(params, "price", 2_000_000)
    down_ratio = _f(params, "downPaymentRatio", 0.3)
    loan_years = _i(params, "loanYears", 30)
    loan_rate = _f(params, "loanRate", 0.039)
    rent_saved = _f(params, "monthlyRentSaved", 0.0)

    down = round(price * down_ratio, 2)
    loan = round(price - down, 2)
    r = loan_rate / 12
    n = loan_years * 12
    monthly_payment = round(loan * r * (1 + r) ** n / ((1 + r) ** n - 1), 2) if r > 0 and n > 0 else 0.0

    new = ctx.clone()
    new.one_off_cost = ctx.one_off_cost + down
    new.allocation = dict(ctx.allocation)
    new.allocation["property"] = round(new.allocation.get("property", 0.0) + price, 2)
    new.allocation["cash"] = round(max(0.0, new.allocation.get("cash", 0.0) - down), 2)
    new.allocation["mortgage"] = round(new.allocation.get("mortgage", 0.0) + loan, 2)
    new.total_assets = round(ctx.total_assets + price - down, 2)
    new.total_liabilities = round(ctx.total_liabilities + loan, 2)
    new.monthly_expense = round(ctx.monthly_expense + monthly_payment - rent_saved, 2)
    new.one_off_cost = ctx.one_off_cost  # 首付已从 cash/总资产中扣除，避免重复计减

    notes = [
        f"购房总价 ¥{price:,.0f}，首付 {down_ratio:.0%}（¥{down:,.0f}），贷款 ¥{loan:,.0f}。",
        f"按年利率 {loan_rate:.2%}、{loan_years} 年等额本息，月供约 ¥{monthly_payment:,.0f}。",
    ]
    if rent_saved > 0:
        notes.append(f"自住后每月省下房租 ¥{rent_saved:,.0f}，已计入支出抵扣。")
    detail = {
        "price": price,
        "downPayment": down,
        "loan": loan,
        "loanYears": loan_years,
        "loanRate": loan_rate,
        "monthlyPayment": monthly_payment,
        "monthlyRentSaved": rent_saved,
    }
    return new, notes, detail


# ------------------------------------------------------------------ 换工作
def _job_change(ctx: WealthContext, params: dict) -> tuple[WealthContext, list[str], dict]:
    new_income = _f(params, "newMonthlyIncome", ctx.monthly_income * 1.2)
    gap_months = _i(params, "gapMonths", 1)

    new = ctx.clone()
    new.monthly_income = round(new_income, 2)
    # 空窗期损失：按原收入计一次性缺口，从现金扣除
    loss = round(ctx.monthly_income * gap_months, 2)
    new.allocation = dict(ctx.allocation)
    new.allocation["cash"] = round(max(0.0, new.allocation.get("cash", 0.0) - loss), 2)
    new.total_assets = round(max(0.0, ctx.total_assets - loss), 2)

    delta = new_income - ctx.monthly_income
    notes = [
        f"月收入由 ¥{ctx.monthly_income:,.0f} 变为 ¥{new_income:,.0f}（{'+' if delta >= 0 else ''}¥{delta:,.0f}）。",
        f"过渡空窗 {gap_months} 个月，一次性收入损失约 ¥{loss:,.0f}。",
    ]
    return new, notes, {"newMonthlyIncome": new_income, "gapMonths": gap_months, "transitionLoss": loss}


# ------------------------------------------------------------------ 创业
def _startup(ctx: WealthContext, params: dict) -> tuple[WealthContext, list[str], dict]:
    capital = _f(params, "initialCapital", 300_000)
    burn_months = _i(params, "burnMonths", 18)
    monthly_income_during = _f(params, "monthlyIncomeDuring", 0.0)

    new = ctx.clone()
    new.allocation = dict(ctx.allocation)
    new.allocation["cash"] = round(max(0.0, new.allocation.get("cash", 0.0) - capital), 2)
    new.total_assets = round(max(0.0, ctx.total_assets - capital), 2)
    new.monthly_income = round(monthly_income_during, 2)
    # 创业期收益波动放大：等效风险偏好上移
    new.risk_level = "aggressive"

    runway = round(new.cash / ctx.monthly_expense, 1) if ctx.monthly_expense > 0 else None
    notes = [
        f"启动投入 ¥{capital:,.0f}，创业期月收入按 ¥{monthly_income_during:,.0f} 计。",
        f"计划烧钱 {burn_months} 个月。" + (f"当前现金可支撑约 {runway} 个月。" if runway is not None else ""),
        "创业期收入波动显著放大，模型已按激进风险口径推演。",
    ]
    return new, notes, {
        "initialCapital": capital,
        "burnMonths": burn_months,
        "monthlyIncomeDuring": monthly_income_during,
        "runwayMonths": runway,
    }


# ------------------------------------------------------------------ 结婚
def _marriage(ctx: WealthContext, params: dict) -> tuple[WealthContext, list[str], dict]:
    one_off = _f(params, "weddingCost", 200_000)
    partner_income = _f(params, "partnerMonthlyIncome", 0.0)
    partner_expense = _f(params, "partnerMonthlyExpense", 0.0)
    partner_assets = _f(params, "partnerAssets", 0.0)

    new = ctx.clone()
    new.allocation = dict(ctx.allocation)
    new.allocation["cash"] = round(max(0.0, new.allocation.get("cash", 0.0) - one_off + partner_assets), 2)
    new.total_assets = round(max(0.0, ctx.total_assets - one_off + partner_assets), 2)
    new.monthly_income = round(ctx.monthly_income + partner_income, 2)
    new.monthly_expense = round(ctx.monthly_expense + partner_expense, 2)

    notes = [
        f"一次性婚礼支出 ¥{one_off:,.0f}。",
        f"家庭月收入合计 ¥{new.monthly_income:,.0f}，月支出合计 ¥{new.monthly_expense:,.0f}。",
    ]
    if partner_assets:
        notes.append(f"并入伴侣资产 ¥{partner_assets:,.0f}。")
    return new, notes, {
        "weddingCost": one_off,
        "partnerMonthlyIncome": partner_income,
        "partnerMonthlyExpense": partner_expense,
        "partnerAssets": partner_assets,
    }


# ------------------------------------------------------------------ 生育
def _childbirth(ctx: WealthContext, params: dict) -> tuple[WealthContext, list[str], dict]:
    one_off = _f(params, "birthCost", 80_000)
    monthly_cost = _f(params, "monthlyChildCost", 4_000)
    income_drop = _f(params, "incomeDropRatio", 0.0)

    new = ctx.clone()
    new.allocation = dict(ctx.allocation)
    new.allocation["cash"] = round(max(0.0, new.allocation.get("cash", 0.0) - one_off), 2)
    new.total_assets = round(max(0.0, ctx.total_assets - one_off), 2)
    new.monthly_expense = round(ctx.monthly_expense + monthly_cost, 2)
    if income_drop > 0:
        new.monthly_income = round(ctx.monthly_income * (1 - income_drop), 2)

    notes = [
        f"一次性生育相关支出 ¥{one_off:,.0f}。",
        f"每月新增育儿支出 ¥{monthly_cost:,.0f}（教育费用会随通胀继续上升）。",
    ]
    if income_drop > 0:
        notes.append(f"因育儿导致收入下降 {income_drop:.0%}。")
    return new, notes, {"birthCost": one_off, "monthlyChildCost": monthly_cost, "incomeDropRatio": income_drop}


# ------------------------------------------------------------------ 退休
def _retirement(ctx: WealthContext, params: dict) -> tuple[WealthContext, list[str], dict]:
    retire_age = _i(params, "retireAge", 60)
    pension = _f(params, "monthlyPension", 0.0)
    expense_ratio = _f(params, "expenseRatioAfter", 0.7)

    new = ctx.clone()
    new.monthly_income = round(pension, 2)
    new.monthly_expense = round(ctx.monthly_expense * expense_ratio, 2)
    new.risk_level = "conservative"  # 退休后资产结构应转保守

    notes = [
        f"计划 {retire_age} 岁退休，退休后月养老金 ¥{pension:,.0f}。",
        f"退休后月支出按当前的 {expense_ratio:.0%} 计（¥{new.monthly_expense:,.0f}）。",
        "退休后资产配置按保守口径推演（年化收益假设下调）。",
    ]
    return new, notes, {"retireAge": retire_age, "monthlyPension": pension, "expenseRatioAfter": expense_ratio}


# ------------------------------------------------------------------ 留学
def _study_abroad(ctx: WealthContext, params: dict) -> tuple[WealthContext, list[str], dict]:
    total_cost = _f(params, "totalCost", 600_000)
    years = _i(params, "years", 2)
    income_during = _f(params, "monthlyIncomeDuring", 0.0)
    income_after = _f(params, "monthlyIncomeAfter", ctx.monthly_income * 1.4)

    new = ctx.clone()
    new.allocation = dict(ctx.allocation)
    new.allocation["cash"] = round(max(0.0, new.allocation.get("cash", 0.0) - total_cost), 2)
    new.total_assets = round(max(0.0, ctx.total_assets - total_cost), 2)
    new.monthly_income = round(income_after, 2)

    notes = [
        f"留学总花费 ¥{total_cost:,.0f}，学制 {years} 年，期间月收入 ¥{income_during:,.0f}。",
        f"毕业后月收入按 ¥{income_after:,.0f} 推演（收入提升是留学的主要财务回报假设）。",
        "该假设不确定性较高，实际回报取决于行业与个人发展。",
    ]
    return new, notes, {
        "totalCost": total_cost,
        "years": years,
        "monthlyIncomeDuring": income_during,
        "monthlyIncomeAfter": income_after,
    }


# ------------------------------------------------------------------ 自定义
def _custom(ctx: WealthContext, params: dict) -> tuple[WealthContext, list[str], dict]:
    one_off = _f(params, "oneOffCost", 0.0)
    income_delta = _f(params, "monthlyIncomeDelta", 0.0)
    expense_delta = _f(params, "monthlyExpenseDelta", 0.0)

    new = ctx.clone()
    new.allocation = dict(ctx.allocation)
    if one_off:
        new.allocation["cash"] = round(max(0.0, new.allocation.get("cash", 0.0) - one_off), 2)
        new.total_assets = round(max(0.0, ctx.total_assets - one_off), 2)
    new.monthly_income = round(max(0.0, ctx.monthly_income + income_delta), 2)
    new.monthly_expense = round(max(0.0, ctx.monthly_expense + expense_delta), 2)

    notes = [
        f"一次性支出 ¥{one_off:,.0f}，月收入变化 ¥{income_delta:,.0f}，月支出变化 ¥{expense_delta:,.0f}。"
    ]
    return new, notes, {
        "oneOffCost": one_off,
        "monthlyIncomeDelta": income_delta,
        "monthlyExpenseDelta": expense_delta,
    }


EVENT_CATALOG: dict[str, dict] = {
    "buy_house": {
        "label": "买房",
        "handler": _buy_house,
        "params": [
            {"key": "price", "label": "房屋总价", "type": "number", "default": 2_000_000},
            {"key": "downPaymentRatio", "label": "首付比例", "type": "ratio", "default": 0.3},
            {"key": "loanYears", "label": "贷款年限", "type": "number", "default": 30},
            {"key": "loanRate", "label": "贷款年利率", "type": "ratio", "default": 0.039},
            {"key": "monthlyRentSaved", "label": "每月省下房租", "type": "number", "default": 0},
        ],
    },
    "job_change": {
        "label": "换工作",
        "handler": _job_change,
        "params": [
            {"key": "newMonthlyIncome", "label": "新月收入", "type": "number", "default": 0},
            {"key": "gapMonths", "label": "空窗月数", "type": "number", "default": 1},
        ],
    },
    "startup": {
        "label": "创业",
        "handler": _startup,
        "params": [
            {"key": "initialCapital", "label": "启动资金", "type": "number", "default": 300_000},
            {"key": "burnMonths", "label": "计划烧钱月数", "type": "number", "default": 18},
            {"key": "monthlyIncomeDuring", "label": "创业期月收入", "type": "number", "default": 0},
        ],
    },
    "marriage": {
        "label": "结婚",
        "handler": _marriage,
        "params": [
            {"key": "weddingCost", "label": "婚礼支出", "type": "number", "default": 200_000},
            {"key": "partnerMonthlyIncome", "label": "伴侣月收入", "type": "number", "default": 0},
            {"key": "partnerMonthlyExpense", "label": "伴侣月支出", "type": "number", "default": 0},
            {"key": "partnerAssets", "label": "伴侣资产", "type": "number", "default": 0},
        ],
    },
    "childbirth": {
        "label": "生育",
        "handler": _childbirth,
        "params": [
            {"key": "birthCost", "label": "一次性支出", "type": "number", "default": 80_000},
            {"key": "monthlyChildCost", "label": "每月育儿支出", "type": "number", "default": 4_000},
            {"key": "incomeDropRatio", "label": "收入下降比例", "type": "ratio", "default": 0},
        ],
    },
    "retirement": {
        "label": "退休",
        "handler": _retirement,
        "params": [
            {"key": "retireAge", "label": "退休年龄", "type": "number", "default": 60},
            {"key": "monthlyPension", "label": "月养老金", "type": "number", "default": 0},
            {"key": "expenseRatioAfter", "label": "退休后支出比例", "type": "ratio", "default": 0.7},
        ],
    },
    "study_abroad": {
        "label": "留学",
        "handler": _study_abroad,
        "params": [
            {"key": "totalCost", "label": "留学总花费", "type": "number", "default": 600_000},
            {"key": "years", "label": "学制年数", "type": "number", "default": 2},
            {"key": "monthlyIncomeDuring", "label": "在读期月收入", "type": "number", "default": 0},
            {"key": "monthlyIncomeAfter", "label": "毕业后月收入", "type": "number", "default": 0},
        ],
    },
    "custom": {
        "label": "自定义事件",
        "handler": _custom,
        "params": [
            {"key": "oneOffCost", "label": "一次性支出", "type": "number", "default": 0},
            {"key": "monthlyIncomeDelta", "label": "月收入变化", "type": "number", "default": 0},
            {"key": "monthlyExpenseDelta", "label": "月支出变化", "type": "number", "default": 0},
        ],
    },
}


def list_events() -> list[dict]:
    return [
        {"type": key, "label": meta["label"], "params": meta["params"]}
        for key, meta in EVENT_CATALOG.items()
    ]


def apply_event(ctx: WealthContext, event_type: str, params: dict | None = None) -> tuple[WealthContext, list[str], dict]:
    """在 Twin 副本上施加事件。未知事件抛 ValueError，由路由转 400。"""
    meta = EVENT_CATALOG.get(event_type)
    if meta is None:
        raise ValueError(f"不支持的人生事件类型：{event_type}")
    handler: EventHandler = meta["handler"]
    new_ctx, notes, detail = handler(ctx, params or {})
    new_ctx.notes = list(ctx.notes) + notes
    return new_ctx, notes, detail
