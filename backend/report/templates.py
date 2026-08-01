"""财富报告模板系统（Phase 7.2 需求八）。

四个可复用模板段：退休规划 / 资产结构 / 现金流 / 投资风险。
每个模板段都是纯函数：AgentContext → Section，零 LLM 成本、可单测。
"""
from __future__ import annotations

from dataclasses import dataclass, field

from backend.agents.context import AgentContext


@dataclass
class Section:
    key: str = ""
    heading: str = ""
    paragraphs: list[str] = field(default_factory=list)
    table: dict | None = None      # {"columns": [...], "rows": [[...]]}
    bullets: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "key": self.key,
            "heading": self.heading,
            "paragraphs": self.paragraphs,
            "table": self.table,
            "bullets": self.bullets,
        }

    def to_markdown(self) -> str:
        parts = [f"## {self.heading}", ""]
        parts.extend(p + "\n" for p in self.paragraphs)
        if self.table and self.table.get("columns"):
            cols = self.table["columns"]
            parts.append("| " + " | ".join(cols) + " |")
            parts.append("| " + " | ".join("---" for _ in cols) + " |")
            for row in self.table.get("rows", []):
                parts.append("| " + " | ".join(str(c) for c in row) + " |")
            parts.append("")
        if self.bullets:
            parts.extend(f"- {b}" for b in self.bullets)
            parts.append("")
        return "\n".join(parts)


def _money(v: float | None) -> str:
    return f"¥{(v or 0):,.0f}"


def _pct(v: float | None) -> str:
    return f"{(v or 0) * 100:.1f}%"


# ------------------------------------------------------------------ 资产结构
TYPE_LABELS = {
    "cash": "现金", "stock": "股票", "fund": "基金", "bond": "债券",
    "property": "房产", "crypto": "加密资产", "gold": "黄金",
    "insurance": "保险", "pension": "养老金", "liability": "负债", "other": "其他",
}


def asset_section(ctx: AgentContext) -> Section:
    w = ctx.wealth
    rows = [
        [TYPE_LABELS.get(k, k), _money(w.allocation.get(k, 0.0)), _pct(v)]
        for k, v in sorted(w.allocation_pct.items(), key=lambda kv: -kv[1])
    ]
    return Section(
        key="asset",
        heading="资产结构",
        paragraphs=[
            f"截至本期，你的总资产为 {_money(w.total_assets)}，总负债 {_money(w.total_liabilities)}，"
            f"净资产 {_money(w.net_worth)}，资产负债率 {_pct(w.debt_ratio)}。"
        ],
        table={"columns": ["资产类别", "金额", "占比"], "rows": rows} if rows else None,
        bullets=[
            f"权益类资产占比 {_pct(w.investment_ratio)}，风险偏好为「{w.risk_level}」",
            f"保障类资产合计 {_money(w.protection_amount)}",
        ],
    )


# ------------------------------------------------------------------ 现金流
def cashflow_section(ctx: AgentContext) -> Section:
    w = ctx.wealth
    months = w.emergency_months
    return Section(
        key="cashflow",
        heading="现金流",
        paragraphs=[
            f"本期月收入 {_money(w.monthly_income)}，月支出 {_money(w.monthly_expense)}，"
            f"月结余 {_money(w.monthly_surplus)}，储蓄率 {_pct(w.savings_rate)}。"
        ],
        table={
            "columns": ["指标", "数值"],
            "rows": [
                ["月收入", _money(w.monthly_income)],
                ["月支出", _money(w.monthly_expense)],
                ["月结余", _money(w.monthly_surplus)],
                ["年度可积累", _money(w.annual_saving)],
                ["应急金覆盖", f"{months} 个月" if months is not None else "—"],
            ],
        },
        bullets=(
            ["应急金不足 3 个月，建议优先补足到 3-6 个月开支"]
            if months is not None and months < 3
            else ["现金流结构稳定，可按计划推进长期投入"]
        ),
    )


# ------------------------------------------------------------------ 退休规划
def retirement_section(ctx: AgentContext) -> Section:
    pred = ctx.prediction()
    r = (pred or {}).get("retirement") or {}
    w = ctx.wealth
    required = r.get("requiredCorpus") or r.get("required") or 0.0
    gap = r.get("gap") or 0.0
    bullets = []
    if gap and gap > 0:
        bullets.append(f"当前测算存在约 {_money(gap)} 的退休资金缺口")
        bullets.append("可通过提高储蓄率、延后退休或下调退休开支预期三条路径改善")
    else:
        bullets.append("按当前节奏，退休资金测算已可覆盖预期开支")
    return Section(
        key="retirement",
        heading="退休规划",
        paragraphs=[
            f"以 4% 提取率测算，退休后每年支出 {_money(w.monthly_expense * 12)}，"
            f"需要储备约 {_money(required)}。"
        ],
        table={
            "columns": ["项目", "金额"],
            "rows": [
                ["所需储备", _money(required)],
                ["当前净资产", _money(w.net_worth)],
                ["缺口", _money(gap)],
            ],
        },
        bullets=bullets,
    )


# ------------------------------------------------------------------ 投资风险
def investment_risk_section(ctx: AgentContext) -> Section:
    w = ctx.wealth
    alloc = w.allocation_pct
    top_type, top_pct = "", 0.0
    for k, v in alloc.items():
        if v > top_pct:
            top_type, top_pct = k, v
    bullets = [
        f"假设年化收益 {_pct(w.base_annual_return)}（基于风险偏好「{w.risk_level}」的模型假设，非承诺收益）",
    ]
    if top_pct > 0.5:
        bullets.append(
            f"{TYPE_LABELS.get(top_type, top_type)}占比达 {_pct(top_pct)}，集中度偏高，建议逐步分散"
        )
    if w.debt_ratio > 0.5:
        bullets.append(f"资产负债率 {_pct(w.debt_ratio)} 偏高，市场波动时抗压能力下降")
    if len(bullets) == 1:
        bullets.append("组合分散度尚可，未发现显著集中度风险")
    return Section(
        key="investment_risk",
        heading="投资与风险",
        paragraphs=[
            f"权益类资产 {_money(w.investment_amount)}，占总资产 {_pct(w.investment_ratio)}。"
        ],
        bullets=bullets,
    )


TEMPLATE_SECTIONS = {
    "asset": asset_section,
    "cashflow": cashflow_section,
    "retirement": retirement_section,
    "investment_risk": investment_risk_section,
}

# 报告类型 → 使用哪些模板段（需求七）
REPORT_TEMPLATES: dict[str, dict] = {
    "monthly": {
        "title": "月度财富报告",
        "sections": ["cashflow", "asset", "investment_risk"],
        "periodFormat": "%Y-%m",
    },
    "annual": {
        "title": "年度财富报告",
        "sections": ["asset", "cashflow", "investment_risk", "retirement"],
        "periodFormat": "%Y",
    },
    "life_plan": {
        "title": "人生规划报告",
        "sections": ["retirement", "asset", "cashflow"],
        "periodFormat": "%Y-%m-%d",
    },
    "investment": {
        "title": "投资分析报告",
        "sections": ["investment_risk", "asset"],
        "periodFormat": "%Y-%m-%d",
    },
}
