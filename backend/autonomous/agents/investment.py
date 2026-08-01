# -*- coding: utf-8 -*-
"""
backend/autonomous/agents/investment.py — Phase 7.4 需求七：投资组合分析增强
（Investment Intelligence Agent）。

自动分析四个维度并产出报告：
    1. 资产配置       —— 各类资产占比与现金冗余
    2. 风险暴露       —— 权益类占比是否匹配用户风险偏好
    3. 行业/标的集中度 —— HHI 指数 + 最大单一持仓占比
    4. 收益变化       —— 接入 Market Data Layer 的组合涨跌

全部结论由规则计算得出（tier=local，零 Token）；仅当发现 high/critical
级问题且成本预算允许时，才用 LLM 对三段式草稿做润色（tier=ai）。
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from backend.autonomous import cost_guard
from backend.autonomous.market.manager import get_manager
from backend.intelligence.context import WealthContext, build_context
from backend.intelligence.reasoning.explain import enhance_with_llm, make_explanation
from backend.user.models import User

AGENT_KEY = "investment"
AGENT_NAME = "投资智能体"

# 风险偏好 → 合理权益仓位区间
_EQUITY_BAND = {
    "conservative": (0.0, 0.30),
    "balanced": (0.25, 0.60),
    "aggressive": (0.50, 0.90),
}
_EQUITY_TYPES = {"stock", "fund", "crypto"}
_TYPE_LABEL = {
    "cash": "现金",
    "stock": "股票",
    "fund": "基金",
    "bond": "债券",
    "property": "房产",
    "crypto": "加密资产",
    "insurance": "保险",
    "other": "其他",
}

_SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}


def _top_severity(findings: list[dict]) -> str:
    if not findings:
        return "low"
    return sorted(findings, key=lambda f: _SEVERITY_ORDER.get(f.get("level", "low"), 3))[0].get("level", "low")


def analyze(
    db: Session,
    user: User,
    ctx: WealthContext | None = None,
    *,
    with_market: bool = True,
    allow_llm: bool = True,
) -> dict:
    ctx = ctx or build_context(db, user)
    now = datetime.now(timezone.utc).isoformat()

    if not ctx.has_data or ctx.total_assets <= 0:
        return {
            "agent": AGENT_KEY,
            "agentName": AGENT_NAME,
            "hasData": False,
            "severity": "low",
            "metrics": {},
            "findings": [],
            "explanation": make_explanation(
                "投资组合分析",
                ["尚未录入任何资产数据。"],
                ["暂时无法评估你的投资结构与风险暴露。"],
                ["先在「金融数据中心」录入持仓，AI 会自动开始持续跟踪。"],
            ).to_dict(),
            "tier": "local",
            "llmCalled": False,
            "generatedAt": now,
        }

    alloc_pct = ctx.allocation_pct
    equity_ratio = round(sum(v for k, v in alloc_pct.items() if k in _EQUITY_TYPES), 4)
    cash_ratio = round(alloc_pct.get("cash", 0.0), 4)
    hhi = round(sum(v * v for v in alloc_pct.values()), 4)
    top_type, top_pct = ("", 0.0)
    if alloc_pct:
        top_type, top_pct = max(alloc_pct.items(), key=lambda kv: kv[1])

    findings: list[dict] = []

    # 1) 风险暴露
    lo, hi = _EQUITY_BAND.get(ctx.risk_level, _EQUITY_BAND["balanced"])
    if equity_ratio > hi:
        gap = equity_ratio - hi
        findings.append(
            {
                "level": "critical" if gap > 0.2 else "high",
                "dimension": "风险暴露",
                "title": f"权益类仓位 {equity_ratio:.0%} 超出 {ctx.risk_level} 偏好上限 {hi:.0%}",
                "detail": f"股票/基金/加密类合计占总资产 {equity_ratio:.1%}，高出建议区间 {gap:.1%}。",
                "advice": f"考虑把约 ¥{ctx.total_assets * gap:,.0f} 从权益类调整到债券或现金类，使仓位回到 {lo:.0%}–{hi:.0%}。",
            }
        )
    elif equity_ratio < lo:
        gap = lo - equity_ratio
        findings.append(
            {
                "level": "medium",
                "dimension": "风险暴露",
                "title": f"权益类仓位 {equity_ratio:.0%} 低于 {ctx.risk_level} 偏好下限 {lo:.0%}",
                "detail": f"当前配置偏保守，长期可能跑输通胀。缺口约 {gap:.1%}。",
                "advice": f"可分批将约 ¥{ctx.total_assets * gap:,.0f} 配置到宽基指数类资产，避免一次性择时。",
            }
        )

    # 2) 集中度
    if top_pct >= 0.5:
        findings.append(
            {
                "level": "high",
                "dimension": "集中度",
                "title": f"{_TYPE_LABEL.get(top_type, top_type)}单一类别占比 {top_pct:.0%}",
                "detail": f"HHI 集中度指数 {hhi:.2f}（>0.25 即视为高度集中），组合抗风险能力较弱。",
                "advice": "增加 2–3 类低相关资产（如债券、现金管理类），把单一类别压到 40% 以内。",
            }
        )
    elif hhi >= 0.35:
        findings.append(
            {
                "level": "medium",
                "dimension": "集中度",
                "title": f"资产集中度偏高（HHI {hhi:.2f}）",
                "detail": "组合类别数量偏少，波动会被放大。",
                "advice": "逐步补充不同风险来源的资产类别，降低同涨同跌概率。",
            }
        )

    # 3) 现金冗余 / 应急金
    if cash_ratio >= 0.6 and ctx.total_assets > 0:
        findings.append(
            {
                "level": "medium",
                "dimension": "资产配置",
                "title": f"现金占比 {cash_ratio:.0%} 偏高",
                "detail": "过多闲置现金在通胀下会持续贬值。",
                "advice": "保留 3–6 个月生活费作为应急金，其余可配置货币基金或短债类产品。",
            }
        )
    months = ctx.emergency_months
    if months is not None and months < 3:
        findings.append(
            {
                "level": "high",
                "dimension": "资产配置",
                "title": f"应急金仅够 {months} 个月",
                "detail": "低于 3 个月的安全线，一旦收入中断将被迫卖出长期资产。",
                "advice": f"优先把现金补足至约 ¥{ctx.monthly_expense * 3:,.0f}（3 个月开支）。",
            }
        )

    # 4) 收益变化（真实行情，失败自动降级）
    market: dict = {}
    if with_market:
        try:
            market = get_manager().get_portfolio_change(db, user)
        except Exception:  # noqa: BLE001
            market = {"hasHoldings": False, "degraded": True, "message": "行情服务暂不可用，已跳过收益分析"}
        change_pct = float(market.get("changePct") or 0.0)
        if market.get("hasHoldings") and abs(change_pct) >= 3:
            adverse = change_pct < 0
            findings.append(
                {
                    "level": "high" if adverse and abs(change_pct) >= 5 else "medium",
                    "dimension": "收益变化",
                    "title": f"组合当日{'下跌' if adverse else '上涨'} {abs(change_pct):.2f}%",
                    "detail": f"对应金额约 ¥{abs(float(market.get('changeAmount') or 0)):,.0f}"
                    + ("（行情降级数据，仅供参考）" if market.get("degraded") else ""),
                    "advice": "短期波动无需追涨杀跌，关注仓位是否仍在你的风险区间内。" if adverse else "涨幅较大时可检视是否需要再平衡。",
                }
            )

    severity = _top_severity(findings)
    tier, tier_reason = cost_guard.decide_tier(
        db, user.id, severity=severity, requested="ai" if allow_llm else "local"
    )

    exp = make_explanation(
        "投资组合分析",
        [
            f"总资产 ¥{ctx.total_assets:,.0f}，权益类占比 {equity_ratio:.1%}，现金占比 {cash_ratio:.1%}。",
            f"风险偏好为 {ctx.risk_level}，对应建议权益区间 {lo:.0%}–{hi:.0%}。",
        ],
        [f["title"] for f in findings[:3]] or ["当前组合结构与你的风险偏好基本匹配。"],
        [f["advice"] for f in findings[:3]] or ["保持现有配置，按季度复检一次即可。"],
    )

    llm_called = False
    if tier == "ai" and findings:
        facts = (
            f"总资产={ctx.total_assets:.0f}; 权益占比={equity_ratio:.4f}; 现金占比={cash_ratio:.4f}; "
            f"HHI={hhi:.4f}; 风险偏好={ctx.risk_level}; 问题数={len(findings)}"
        )
        before = exp.tier
        exp = enhance_with_llm(db, user, exp, facts=facts, complex_enough=True, max_tokens=420)
        llm_called = exp.tier == "ai" and before != "ai"
    else:
        tier = "local" if tier == "ai" else tier

    return {
        "agent": AGENT_KEY,
        "agentName": AGENT_NAME,
        "hasData": True,
        "severity": severity,
        "metrics": {
            "totalAssets": round(ctx.total_assets, 2),
            "netWorth": ctx.net_worth,
            "equityRatio": equity_ratio,
            "cashRatio": cash_ratio,
            "hhi": hhi,
            "topType": top_type,
            "topTypeLabel": _TYPE_LABEL.get(top_type, top_type),
            "topTypePct": round(top_pct, 4),
            "emergencyMonths": months,
            "allocation": {(_TYPE_LABEL.get(k, k)): round(v, 4) for k, v in alloc_pct.items()},
            "riskLevel": ctx.risk_level,
            "equityBand": [lo, hi],
        },
        "market": market,
        "findings": findings,
        "explanation": exp.to_dict(),
        "tier": exp.tier if llm_called else tier,
        "tierReason": tier_reason,
        "llmCalled": llm_called,
        "generatedAt": now,
    }
