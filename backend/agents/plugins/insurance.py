"""Insurance Agent —— 保障缺口分析（Phase 7.2 需求十）。"""
from __future__ import annotations

from backend.agents.base import AgentResult, BaseAgent
from backend.agents.context import AgentContext
from backend.agents.registry import register

# 经验口径：寿险保额 ≈ 年收入 × 10 或覆盖全部负债 + 家庭 5 年开支
LIFE_COVER_MULTIPLE = 10
CRITICAL_ILLNESS_YEARS = 3


@register
class InsuranceAgent(BaseAgent):
    name = "insurance"
    title = "保障规划 Agent"
    domain = "insurance"
    description = "评估寿险/重疾保额是否覆盖负债与家庭开支，识别保障缺口。"
    default_enabled = True
    tools = ("db.assets", "db.profile")

    def applicable(self, ctx: AgentContext) -> bool:
        return ctx.has_data

    def run(self, ctx: AgentContext) -> AgentResult:
        w = ctx.wealth
        annual_income = round(w.monthly_income * 12, 2)
        annual_expense = round(w.monthly_expense * 12, 2)
        current_cover = w.protection_amount

        need_life = round(max(annual_income * LIFE_COVER_MULTIPLE, w.total_liabilities + annual_expense * 5), 2)
        need_ci = round(annual_expense * CRITICAL_ILLNESS_YEARS + annual_income, 2)
        need_total = round(need_life, 2)
        gap = round(max(0.0, need_total - current_cover), 2)
        coverage = round(min(1.0, current_cover / need_total), 4) if need_total > 0 else 0.0
        score = round(min(100.0, coverage * 100), 1)

        cause = [
            f"年收入 ¥{annual_income:,.0f}、年支出 ¥{annual_expense:,.0f}、总负债 ¥{w.total_liabilities:,.0f}",
            f"按经验口径需要寿险保额约 ¥{need_life:,.0f}、重疾保额约 ¥{need_ci:,.0f}",
            f"当前已录入的保障类资产合计 ¥{current_cover:,.0f}（覆盖 {coverage * 100:.0f}%）",
        ]

        if gap > 0:
            impact = [
                f"保障缺口约 ¥{gap:,.0f}，一旦发生极端事件，家庭现金流与负债偿付将面临压力",
            ]
            advice = [
                f"优先补足定期寿险至 ¥{need_life:,.0f}，覆盖房贷等长期负债",
                f"重疾险保额建议不低于 ¥{need_ci:,.0f}（约 3 年家庭开支 + 1 年收入损失）",
                "医疗险优先选百万医疗，保费低、杠杆高，先补齐再考虑储蓄型产品",
            ]
            headline = f"保障存在约 ¥{gap:,.0f} 的缺口，建议优先补齐纯保障型产品。"
        else:
            impact = ["保障额度已覆盖测算需求，家庭抗风险能力较好"]
            advice = [
                "每年复核一次保额，收入或负债明显变化时同步调整",
                "避免用储蓄型保险替代投资，保障与理财分开配置更高效",
            ]
            headline = "保障额度充足，已覆盖负债与家庭开支需求。"

        if w.emergency_months is not None and w.emergency_months < 3:
            advice.append(f"应急金仅够 {w.emergency_months} 个月，建议先补足到 3-6 个月")

        return AgentResult(
            agent=self.name, title=self.title, score=score, headline=headline,
            cause=cause, impact=impact, advice=advice,
            metrics={
                "needLife": need_life,
                "needCriticalIllness": need_ci,
                "currentCover": current_cover,
                "gap": gap,
                "coverage": coverage,
            },
            tools_used=list(self.tools),
        )
