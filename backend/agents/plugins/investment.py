"""Investment Agent —— 投资配置分析（Phase 7.2 需求十）。"""
from __future__ import annotations

from backend.agents.base import AgentResult, BaseAgent
from backend.agents.context import AgentContext
from backend.agents.registry import register
from backend.agents.tools import run_tool

# 风险偏好 → 建议权益类占比区间
TARGET_EQUITY = {
    "conservative": (0.10, 0.30),
    "balanced": (0.30, 0.55),
    "aggressive": (0.55, 0.80),
}

TYPE_LABELS = {
    "cash": "现金", "stock": "股票", "fund": "基金", "bond": "债券",
    "property": "房产", "crypto": "加密资产", "gold": "黄金",
    "insurance": "保险", "pension": "养老金", "other": "其他",
}


@register
class InvestmentAgent(BaseAgent):
    name = "investment"
    title = "投资配置 Agent"
    domain = "investment"
    description = "分析资产配置结构与集中度风险，给出再平衡方向。"
    default_enabled = True
    tools = ("db.assets", "db.profile")

    def applicable(self, ctx: AgentContext) -> bool:
        return ctx.has_data and ctx.wealth.total_assets > 0

    def run(self, ctx: AgentContext) -> AgentResult:
        w = ctx.wealth
        assets = run_tool(ctx, "db.assets", limit=200)
        alloc = w.allocation_pct
        equity_ratio = w.investment_ratio
        low, high = TARGET_EQUITY.get(w.risk_level, (0.30, 0.55))

        # 集中度：单一资产占比
        top_type, top_pct = "", 0.0
        for k, v in alloc.items():
            if v > top_pct:
                top_type, top_pct = k, v

        cause = [
            f"当前总资产 ¥{w.total_assets:,.0f}，权益类（股票/基金/债券等）占比 {equity_ratio * 100:.1f}%",
            f"风险偏好为「{w.risk_level}」，对应建议权益仓位 {low * 100:.0f}%–{high * 100:.0f}%",
        ]
        if top_type:
            cause.append(f"占比最高的是{TYPE_LABELS.get(top_type, top_type)}，达 {top_pct * 100:.1f}%")

        impact: list[str] = []
        advice: list[str] = []
        score = 70.0

        if equity_ratio < low:
            gap_amount = round((low - equity_ratio) * w.total_assets, 2)
            impact.append(f"权益仓位偏低，长期收益可能跑不赢通胀，与目标下限相差约 ¥{gap_amount:,.0f}")
            advice.append(f"可分批将约 ¥{gap_amount:,.0f} 从现金转入宽基指数基金，建议 6-12 个月分批建仓")
            score = 58.0
            headline = "权益仓位低于风险偏好对应区间，长期增值动力不足。"
        elif equity_ratio > high:
            excess = round((equity_ratio - high) * w.total_assets, 2)
            impact.append(f"权益仓位高于风险偏好上限，市场回撤时波动会明显超出承受范围（超配约 ¥{excess:,.0f}）")
            advice.append(f"建议减仓约 ¥{excess:,.0f} 转入货币基金或短债，降低组合波动")
            score = 62.0
            headline = "权益仓位超出风险偏好上限，回撤风险偏高。"
        else:
            impact.append("权益仓位处于与风险偏好匹配的区间，结构基本合理")
            advice.append("保持现有配置，每半年做一次再平衡即可")
            score = 82.0
            headline = "资产配置与风险偏好匹配，结构基本健康。"

        if top_pct > 0.6:
            impact.append(f"单一资产占比超过 60%，集中度风险偏高")
            advice.append(f"逐步降低{TYPE_LABELS.get(top_type, top_type)}占比至 50% 以内，分散到其他类别")
            score -= 12

        if w.cash > 0 and w.emergency_months is not None and w.emergency_months < 3:
            advice.append(f"应急现金仅够 {w.emergency_months} 个月，建议先补足到 3-6 个月再加仓")

        return AgentResult(
            agent=self.name, title=self.title, score=round(max(0.0, min(100.0, score)), 1),
            headline=headline, cause=cause, impact=impact, advice=advice,
            metrics={
                "totalAssets": w.total_assets,
                "equityRatio": round(equity_ratio, 4),
                "targetRange": [low, high],
                "allocation": alloc,
                "topType": top_type,
                "topPct": round(top_pct, 4),
                "assetCount": assets.get("count", 0),
            },
            tools_used=list(self.tools),
        )
