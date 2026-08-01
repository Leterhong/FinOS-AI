"""Tax Agent —— 个税与税优账户分析（Phase 7.2 需求十）。

免责：仅为信息性估算，不构成税务意见，具体以税务机关口径为准。
"""
from __future__ import annotations

from backend.agents.base import AgentResult, BaseAgent
from backend.agents.context import AgentContext
from backend.agents.registry import register
from backend.agents.tools import run_tool

PENSION_ANNUAL_CAP = 12000.0  # 个人养老金年度缴存上限


@register
class TaxAgent(BaseAgent):
    name = "tax"
    title = "税务优化 Agent"
    domain = "tax"
    description = "估算工资薪金个税负担，识别专项附加扣除与税优账户空间。"
    default_enabled = False  # 默认关闭，用户可在 Agent 市场开启
    tools = ("db.profile", "calc.tax_salary")

    def applicable(self, ctx: AgentContext) -> bool:
        return ctx.has_data and ctx.wealth.monthly_income > 0

    def run(self, ctx: AgentContext) -> AgentResult:
        w = ctx.wealth
        tax = run_tool(ctx, "calc.tax_salary", monthlyIncome=w.monthly_income)
        annual_tax = tax.get("estimatedAnnualTax", 0.0)
        eff = tax.get("effectiveRate", 0.0)
        annual_income = tax.get("annualIncome", 0.0)

        pension_amount = w.allocation.get("pension", 0.0)
        pension_room = round(max(0.0, PENSION_ANNUAL_CAP - min(pension_amount, PENSION_ANNUAL_CAP)), 2)
        # 个人养老金按边际税率抵扣，粗略以有效税率的 1.5 倍近似边际档
        marginal = min(0.45, max(0.03, eff * 1.5))
        potential_saving = round(pension_room * marginal, 2)

        score = round(max(30.0, 100.0 - eff * 260), 1)

        cause = [
            f"年综合所得约 ¥{annual_income:,.0f}，估算年度个税约 ¥{annual_tax:,.0f}",
            f"有效税负率约 {eff * 100:.1f}%（已按简化口径扣除起征点与社保公积金估算）",
        ]
        impact = [
            f"个税相当于每月减少可支配现金约 ¥{annual_tax / 12:,.0f}",
        ]
        advice: list[str] = []
        if pension_room > 0:
            impact.append(f"个人养老金账户还有 ¥{pension_room:,.0f} 的年度缴存空间未使用")
            advice.append(
                f"用满个人养老金额度（¥{pension_room:,.0f}），按当前税档预计每年可少缴约 ¥{potential_saving:,.0f}"
            )
        advice.extend(
            [
                "核对住房租金/房贷利息/子女教育/赡养老人等专项附加扣除是否已全部申报",
                "年终奖可对比「单独计税」与「并入综合所得」两种口径，择低申报",
            ]
        )
        headline = (
            f"年度个税约 ¥{annual_tax:,.0f}，尚有 ¥{pension_room:,.0f} 税优额度可用。"
            if pension_room > 0
            else f"年度个税约 ¥{annual_tax:,.0f}，税优额度已基本用满。"
        )

        return AgentResult(
            agent=self.name, title=self.title, score=score, headline=headline,
            cause=cause, impact=impact, advice=advice,
            metrics={
                "annualIncome": annual_income,
                "estimatedAnnualTax": annual_tax,
                "effectiveRate": eff,
                "pensionRoom": pension_room,
                "potentialSaving": potential_saving,
                "note": "简化估算，不构成税务意见。",
            },
            tools_used=list(self.tools),
        )
