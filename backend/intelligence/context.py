"""WealthContext —— Intelligence 各子域共享的「财富上下文」。

职责：把数据库里的 FinancialProfile / Asset 归一化成一个可复制、可修改的纯数据对象，
供预测（prediction）、模拟（simulation）、评分（scoring）、策略（recommendation）复用。

硬性约束：无任何数据时 has_data=False，上层必须返回欢迎文案，绝不编造数字。
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field, replace

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.financial.models import Asset, FinancialProfile
from backend.intelligence.constants import (
    INVESTMENT_TYPES,
    LIABILITY_TYPES,
    PROTECTION_TYPES,
    RISK_EXPECTED_RETURN,
)
from backend.user.models import User


@dataclass
class WealthContext:
    has_data: bool = False
    age: int | None = None
    risk_level: str = "balanced"
    monthly_income: float = 0.0
    monthly_expense: float = 0.0
    goal_text: str | None = None
    goal_amount: float | None = None
    allocation: dict[str, float] = field(default_factory=dict)  # 类型 -> 金额（负债为正数单独统计）
    total_assets: float = 0.0
    total_liabilities: float = 0.0
    one_off_cost: float = 0.0        # 情景模拟的一次性支出（如首付）
    extra_annual_return: float = 0.0  # 情景模拟对收益率的调整
    notes: list[str] = field(default_factory=list)

    # ---- 派生属性 ----
    @property
    def net_worth(self) -> float:
        return round(self.total_assets - self.total_liabilities, 2)

    @property
    def monthly_surplus(self) -> float:
        return round(self.monthly_income - self.monthly_expense, 2)

    @property
    def annual_saving(self) -> float:
        return round(self.monthly_surplus * 12, 2)

    @property
    def savings_rate(self) -> float:
        return round(self.monthly_surplus / self.monthly_income, 4) if self.monthly_income > 0 else 0.0

    @property
    def cash(self) -> float:
        return round(self.allocation.get("cash", 0.0), 2)

    @property
    def investment_amount(self) -> float:
        return round(sum(v for k, v in self.allocation.items() if k in INVESTMENT_TYPES), 2)

    @property
    def protection_amount(self) -> float:
        return round(sum(v for k, v in self.allocation.items() if k in PROTECTION_TYPES), 2)

    @property
    def investment_ratio(self) -> float:
        return round(self.investment_amount / self.total_assets, 4) if self.total_assets > 0 else 0.0

    @property
    def emergency_months(self) -> float | None:
        return round(self.cash / self.monthly_expense, 1) if self.monthly_expense > 0 else None

    @property
    def base_annual_return(self) -> float:
        base = RISK_EXPECTED_RETURN.get(self.risk_level, 0.05)
        return round(max(-0.05, base + self.extra_annual_return), 4)

    @property
    def debt_ratio(self) -> float:
        return round(self.total_liabilities / self.total_assets, 4) if self.total_assets > 0 else 0.0

    @property
    def allocation_pct(self) -> dict[str, float]:
        if self.total_assets <= 0:
            return {}
        return {
            k: round(v / self.total_assets, 4)
            for k, v in self.allocation.items()
            if k not in LIABILITY_TYPES
        }

    def clone(self, **changes) -> "WealthContext":
        """复制一份并覆盖字段（情景模拟专用，绝不污染真实 Twin）。"""
        new = replace(self, allocation=dict(self.allocation), notes=list(self.notes))
        for key, val in changes.items():
            setattr(new, key, val)
        return new

    def to_dict(self) -> dict:
        return {
            "hasData": self.has_data,
            "age": self.age,
            "riskLevel": self.risk_level,
            "netWorth": self.net_worth,
            "totalAssets": self.total_assets,
            "totalLiabilities": self.total_liabilities,
            "monthlyIncome": self.monthly_income,
            "monthlyExpense": self.monthly_expense,
            "monthlySurplus": self.monthly_surplus,
            "savingsRate": self.savings_rate,
            "cash": self.cash,
            "emergencyMonths": self.emergency_months,
            "investmentRatio": self.investment_ratio,
            "protectionAmount": self.protection_amount,
            "debtRatio": self.debt_ratio,
            "allocation": self.allocation_pct,
            "goal": self.goal_text,
            "goalAmount": self.goal_amount,
            "assumedAnnualReturn": self.base_annual_return,
        }


# 带金额单位的数字，如「500万」「1.2亿」「800k」
_GOAL_UNIT_RE = re.compile(r"(\d[\d,]*(?:\.\d+)?)\s*(亿|万|w|W|k|K)")
# 显式以「元」结尾的数字，如「5000000元」
_GOAL_YUAN_RE = re.compile(r"(\d[\d,]*(?:\.\d+)?)\s*(?:元|块|人民币|RMB|rmb|¥)")
# 裸数字（无任何单位），用于兜底
_GOAL_PLAIN_RE = re.compile(r"(\d[\d,]*(?:\.\d+)?)")
# 紧跟这些后缀的数字属于时间/年龄/比例，不能当成金额
_TIME_SUFFIX = ("年", "岁", "个月", "月", "周", "天", "日", "%", "％", "倍")

_UNIT_FACTOR = {"亿": 100_000_000, "万": 10_000, "w": 10_000, "W": 10_000, "k": 1_000, "K": 1_000}


def parse_goal_amount(goal: str | None) -> float | None:
    """从目标文本解析金额。

    「10年内攒够500万退休」→ 5_000_000（不能误取「10年」的 10）。
    「55岁退休」→ None（年龄不是金额）。
    """
    if not goal:
        return None

    def _num(raw: str) -> float | None:
        try:
            v = float(raw.replace(",", ""))
        except ValueError:
            return None
        return v if v > 0 else None

    # 1) 优先：带金额单位（亿/万/k）
    m = _GOAL_UNIT_RE.search(goal)
    if m:
        value = _num(m.group(1))
        if value is not None:
            return value * _UNIT_FACTOR.get(m.group(2), 1)

    # 2) 其次：显式带「元」
    m = _GOAL_YUAN_RE.search(goal)
    if m:
        value = _num(m.group(1))
        if value is not None:
            return value

    # 3) 兜底：裸数字，需排除时间/年龄，且量级足够大才视为金额
    for m in _GOAL_PLAIN_RE.finditer(goal):
        tail = goal[m.end():].lstrip()
        if tail.startswith(_TIME_SUFFIX):
            continue
        value = _num(m.group(1))
        if value is not None and value >= 10_000:
            return value
    return None


def parse_goal_year(goal: str | None) -> int | None:
    """从目标文本解析年限，如「10年内…」→ 10；「55岁退休」交由退休模块处理。"""
    if not goal:
        return None
    m = re.search(r"(\d{1,2})\s*年", goal)
    if m:
        years = int(m.group(1))
        return years if 0 < years <= 60 else None
    return None


def build_context(db: Session, user: User) -> WealthContext:
    """从数据库构建财富上下文。无 profile 且无资产 → has_data=False。"""
    profile = db.scalar(select(FinancialProfile).where(FinancialProfile.user_id == user.id))
    assets = list(db.scalars(select(Asset).where(Asset.user_id == user.id)))
    return context_from_records(profile, assets)


def context_from_records(profile: FinancialProfile | None, assets: list[Asset]) -> WealthContext:
    if profile is None and not assets:
        return WealthContext(has_data=False)

    allocation: dict[str, float] = {}
    total_assets = 0.0
    total_liabilities = 0.0
    for a in assets:
        amount = float(a.amount or 0.0)
        allocation[a.type] = round(allocation.get(a.type, 0.0) + amount, 2)
        if a.type in LIABILITY_TYPES:
            total_liabilities += amount
        else:
            total_assets += amount

    goal_text = profile.goal if profile else None
    return WealthContext(
        has_data=True,
        age=profile.age if profile else None,
        risk_level=(profile.risk_level if profile else "balanced") or "balanced",
        monthly_income=float(profile.income) if profile else 0.0,
        monthly_expense=float(profile.expense) if profile else 0.0,
        goal_text=goal_text,
        goal_amount=parse_goal_amount(goal_text),
        allocation=allocation,
        total_assets=round(total_assets, 2),
        total_liabilities=round(total_liabilities, 2),
    )
