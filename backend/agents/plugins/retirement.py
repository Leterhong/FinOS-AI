"""Retirement Agent —— 退休规划（Phase 7.2 需求十）。"""
from __future__ import annotations

from backend.agents.base import AgentResult, BaseAgent
from backend.agents.context import AgentContext
from backend.agents.registry import register
from backend.agents.tools import run_tool


@register
class RetirementAgent(BaseAgent):
    name = "retirement"
    title = "退休规划 Agent"
    domain = "retirement"
    description = "测算退休资金缺口、可支撑年限，并给出补足路径。"
    default_enabled = True
    tools = ("db.profile", "calc.retirement_gap", "calc.compound")

    def applicable(self, ctx: AgentContext) -> bool:
        return ctx.has_data

    def run(self, ctx: AgentContext) -> AgentResult:
        w = ctx.wealth
        annual_expense = round(w.monthly_expense * 12, 2)
        gap_info = run_tool(ctx, "calc.retirement_gap", annualExpense=annual_expense)
        required = gap_info.get("requiredCorpus", 0.0)
        gap = gap_info.get("gap", 0.0)
        covered = gap_info.get("covered", 0.0)

        pred = ctx.prediction()
        retirement = (pred or {}).get("retirement") or {}
        years_to_retire = retirement.get("yearsToRetirement")
        if years_to_retire is None and w.age is not None:
            years_to_retire = max(0, 60 - int(w.age))

        future = run_tool(
            ctx, "calc.compound",
            principal=w.net_worth, annualRate=w.base_annual_return,
            years=int(years_to_retire or 10), monthly=max(0.0, w.monthly_surplus),
        )
        projected = future.get("futureValue", 0.0)
        shortfall = round(max(0.0, required - projected), 2)

        score = 100.0 if required <= 0 else round(min(100.0, (projected / required) * 100), 1)

        cause = [
            f"按当前月支出 ¥{w.monthly_expense:,.0f} 推算，退休后每年需要 ¥{annual_expense:,.0f}",
            f"按 4% 提取率，需要储备约 ¥{required:,.0f}，当前净资产 ¥{w.net_worth:,.0f}（覆盖 {covered * 100:.0f}%）",
        ]
        impact = [
            f"若维持每月结余 ¥{w.monthly_surplus:,.0f}、年化 {w.base_annual_return * 100:.1f}%，"
            f"{int(years_to_retire or 10)} 年后可积累约 ¥{projected:,.0f}",
        ]
        if shortfall > 0:
            impact.append(f"距离退休目标仍缺口约 ¥{shortfall:,.0f}")
            monthly_extra = round(shortfall / max(1, int(years_to_retire or 10)) / 12, 2)
            advice = [
                f"每月额外储蓄约 ¥{monthly_extra:,.0f} 可基本补上缺口",
                "优先把结余投入长期账户，避免频繁支取打断复利",
                "如缺口过大，可考虑延后 2-3 年退休或适度下调退休后开支预期",
            ]
            headline = f"退休资金存在约 ¥{shortfall:,.0f} 的缺口，需要提升储蓄或延后退休。"
        else:
            impact.append("按当前节奏，退休资金已可覆盖预期开支")
            advice = [
                "保持现有储蓄与投资节奏即可",
                "定期复核通胀与医疗支出假设，每年更新一次退休测算",
            ]
            headline = "退休资金储备充足，按当前节奏可覆盖退休后开支。"

        return AgentResult(
            agent=self.name, title=self.title, score=score, headline=headline,
            cause=cause, impact=impact, advice=advice,
            metrics={
                "requiredCorpus": required,
                "currentNetWorth": w.net_worth,
                "projectedCorpus": projected,
                "shortfall": shortfall,
                "yearsToRetirement": int(years_to_retire or 10),
                "coverage": covered,
            },
            tools_used=list(self.tools),
        )
