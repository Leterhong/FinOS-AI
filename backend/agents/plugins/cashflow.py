"""Cashflow Agent —— 现金流与储蓄率分析（Phase 7.2 需求十）。"""
from __future__ import annotations

from backend.agents.base import AgentResult, BaseAgent
from backend.agents.context import AgentContext
from backend.agents.registry import register
from backend.agents.tools import run_tool


@register
class CashflowAgent(BaseAgent):
    name = "cashflow"
    title = "现金流 Agent"
    domain = "cashflow"
    description = "分析收支结构、储蓄率与应急金覆盖月数。"
    default_enabled = True
    priority = 10
    tools = ("db.profile", "db.transactions")

    def applicable(self, ctx: AgentContext) -> bool:
        return ctx.has_data and (ctx.wealth.monthly_income > 0 or ctx.wealth.monthly_expense > 0)

    def run(self, ctx: AgentContext) -> AgentResult:
        w = ctx.wealth
        tx = run_tool(ctx, "db.transactions", limit=50)
        rate = w.savings_rate
        surplus = w.monthly_surplus
        months = w.emergency_months

        if rate >= 0.4:
            score, level = 92.0, "非常健康"
        elif rate >= 0.25:
            score, level = 80.0, "健康"
        elif rate >= 0.1:
            score, level = 62.0, "偏紧"
        elif rate > 0:
            score, level = 45.0, "紧张"
        else:
            score, level = 25.0, "入不敷出"

        cause = [
            f"月收入 ¥{w.monthly_income:,.0f}、月支出 ¥{w.monthly_expense:,.0f}，月结余 ¥{surplus:,.0f}",
            f"储蓄率 {rate * 100:.1f}%，属于「{level}」区间",
        ]
        if months is not None:
            cause.append(f"现金类资产 ¥{w.cash:,.0f}，可覆盖 {months} 个月开支")

        impact: list[str] = [f"按当前节奏，每年可积累约 ¥{w.annual_saving:,.0f}"]
        advice: list[str] = []

        if surplus <= 0:
            impact.append("支出已超过收入，净资产将持续被侵蚀")
            advice.append("先做一个月的开支盘点，锁定金额最大的 3 项非必要支出并压缩")
            advice.append("暂停新增长期投入，优先恢复正现金流")
            headline = "当前收支为负，需优先修复现金流。"
        elif rate < 0.2:
            impact.append("储蓄率偏低，长期财富积累速度受限")
            advice.append("目标把储蓄率提到 20% 以上，先设自动转存再消费")
            headline = f"储蓄率 {rate * 100:.1f}% 偏低，建议提升到 20% 以上。"
        else:
            impact.append("储蓄能力良好，可支撑中长期投资计划")
            advice.append("保持自动储蓄，将结余按月定投而非年底一次性投入")
            headline = f"现金流健康，储蓄率 {rate * 100:.1f}%。"

        if months is not None and months < 3:
            advice.append(f"应急金仅 {months} 个月，建议先补足到 3-6 个月再谈投资")
        elif months is not None and months > 12:
            advice.append(f"应急金已达 {months} 个月，超出部分可转入稳健理财提高效率")

        return AgentResult(
            agent=self.name, title=self.title, score=score, headline=headline,
            cause=cause, impact=impact, advice=advice,
            metrics={
                "monthlyIncome": w.monthly_income,
                "monthlyExpense": w.monthly_expense,
                "monthlySurplus": surplus,
                "savingsRate": rate,
                "emergencyMonths": months,
                "annualSaving": w.annual_saving,
                "transactionCount": tx.get("count", 0),
            },
            tools_used=list(self.tools),
        )
