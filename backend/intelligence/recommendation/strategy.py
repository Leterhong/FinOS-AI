"""财富策略生成器（Phase 7.1 需求五）。

产出三档规划：
- short  短期（0-1 年）：现金流、应急金、高息负债
- mid    中期（1-5 年）：资产配置、目标推进、大额支出安排
- long   长期（5 年以上）：退休、复利、结构性优化

策略由「六维评分 + 预测结果」的规则引擎生成（零 LLM）；
仅在用户已配置模型且存在明显短板时，调用 LLM 对策略叙述做一次润色。
所有策略只描述方向与额度区间，绝不给出具体买卖标的（需求十五）。
"""
from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.intelligence.constants import DISCLAIMER, WELCOME_MESSAGE
from backend.intelligence.context import WealthContext
from backend.intelligence.models import WealthStrategy
from backend.intelligence.reasoning.explain import enhance_with_llm, make_explanation
from backend.user.models import User

HORIZON_LABELS = {"short": "短期（0-1 年）", "mid": "中期（1-5 年）", "long": "长期（5 年以上）"}


def _short_term(ctx: WealthContext, score: dict) -> list[dict]:
    actions: list[dict] = []
    em = ctx.emergency_months
    if ctx.monthly_surplus < 0:
        actions.append(
            {
                "title": "止血：把月度结余拉回正值",
                "detail": f"当前月结余 ¥{ctx.monthly_surplus:,.0f} 为负，建议 3 个月内削减 ¥{abs(ctx.monthly_surplus):,.0f} 的可变支出或增加同等收入。",
                "priority": "high",
            }
        )
    if em is not None and em < 3:
        need = round(max(0.0, ctx.monthly_expense * 3 - ctx.cash), 2)
        actions.append(
            {
                "title": "补足应急金至 3-6 个月支出",
                "detail": f"当前现金可覆盖 {em} 个月，建议再积累约 ¥{need:,.0f} 的活期/货基类资产。",
                "priority": "high",
            }
        )
    if ctx.debt_ratio > 0.5:
        actions.append(
            {
                "title": "优先偿还高成本负债",
                "detail": f"负债率 {ctx.debt_ratio:.0%} 偏高，建议把每月结余的 30%-50% 用于偿还利率最高的负债。",
                "priority": "high",
            }
        )
    if ctx.savings_rate > 0 and ctx.savings_rate < 0.2:
        actions.append(
            {
                "title": "把储蓄率提升到 20% 以上",
                "detail": f"当前储蓄率 {ctx.savings_rate:.0%}，建议设定自动转存，先储蓄后消费。",
                "priority": "medium",
            }
        )
    if not actions:
        actions.append(
            {
                "title": "维持现有现金流节奏",
                "detail": f"月结余 ¥{ctx.monthly_surplus:,.0f}、应急金覆盖 {em} 个月，短期无需调整，按月复核即可。",
                "priority": "low",
            }
        )
    return actions


def _mid_term(ctx: WealthContext, score: dict, pred: dict) -> list[dict]:
    actions: list[dict] = []
    inv_dim = next((d for d in score.get("dimensions", []) if d["key"] == "investment"), None)
    if inv_dim and inv_dim["score"] < 60:
        actions.append(
            {
                "title": "调整投资比例至风险偏好对应区间",
                "detail": f"当前投资类资产占比 {ctx.investment_ratio:.0%}，与「{ctx.risk_level}」偏好不匹配，建议以定投方式分批调整，避免一次性择时。",
                "priority": "medium",
            }
        )
    top = max(ctx.allocation_pct.items(), key=lambda kv: kv[1], default=None)
    if top and top[1] >= 0.7:
        actions.append(
            {
                "title": "降低单一资产集中度",
                "detail": f"「{top[0]}」占比 {top[1]:.0%}，建议在 1-3 年内把单一类别控制到 50% 以内，用增量资金摊薄而非割肉。",
                "priority": "medium",
            }
        )
    goal = pred.get("goal") or {}
    if goal.get("available") and goal.get("probability", 0) < 0.6:
        actions.append(
            {
                "title": "提高财富目标达成概率",
                "detail": f"目标 ¥{goal['targetAmount']:,.0f} 在 {goal['horizonYears']} 年内达成概率仅 {goal['probability']:.0%}，可通过延长年限、下调目标或提高月储蓄三选一来改善。",
                "priority": "high",
            }
        )
    if ctx.protection_amount <= 0:
        actions.append(
            {
                "title": "补齐基础保障",
                "detail": "尚未记录保险类资产，建议优先配置医疗与意外等基础保障，避免单次风险事件击穿资产表。",
                "priority": "medium",
            }
        )
    if not actions:
        actions.append(
            {
                "title": "维持配置结构，按年再平衡",
                "detail": "中期结构健康，建议每 12 个月做一次再平衡，把偏离目标比例超过 10% 的类别调回。",
                "priority": "low",
            }
        )
    return actions


def _long_term(ctx: WealthContext, pred: dict) -> list[dict]:
    actions: list[dict] = []
    ret = pred.get("retirement") or {}
    if ret.get("available"):
        if not ret.get("covered"):
            actions.append(
                {
                    "title": "补上退休资金缺口",
                    "detail": f"距退休 {ret['yearsToRetirement']} 年，预计缺口 ¥{ret['gap']:,.0f}，需每月额外储蓄约 ¥{ret['extraMonthlySavingNeeded']:,.0f}，或考虑延后退休年龄。",
                    "priority": "high",
                }
            )
        else:
            actions.append(
                {
                    "title": "锁定退休储备并逐步转保守",
                    "detail": f"预计退休时可积累 ¥{ret['projectedCapital']:,.0f}，已覆盖测算需求；临近退休 5 年内建议逐步降低权益类占比。",
                    "priority": "medium",
                }
            )
    else:
        actions.append(
            {
                "title": "补充年龄信息以启用退休测算",
                "detail": "未填写年龄，系统无法测算退休资金缺口。补充后可获得完整的退休规划。",
                "priority": "medium",
            }
        )
    milestones = {m["year"]: m["netWorth"] for m in pred.get("milestones", [])}
    if 10 in milestones:
        actions.append(
            {
                "title": "以复利为核心的长期积累",
                "detail": f"按年化 {ctx.base_annual_return:.1%} 假设，10 年后净资产约 ¥{milestones[10]:,.0f}；坚持长期定投比择时更能决定最终结果。",
                "priority": "low",
            }
        )
    return actions


def generate_strategies(
    db: Session,
    user: User,
    ctx: WealthContext,
    score: dict,
    pred: dict,
    *,
    use_ai: bool = True,
) -> dict:
    """生成短/中/长期策略 + 三段式解释。"""
    if not ctx.has_data:
        return {"hasData": False, "message": WELCOME_MESSAGE, "disclaimer": DISCLAIMER}

    buckets = {
        "short": _short_term(ctx, score),
        "mid": _mid_term(ctx, score, pred),
        "long": _long_term(ctx, pred),
    }
    weakest = score.get("weakest", {})
    cause = [
        f"财富健康总分 {score.get('totalScore')}（{score.get('level')}），最薄弱维度是「{weakest.get('label')}」（{weakest.get('score')} 分）。",
        f"当前月结余 ¥{ctx.monthly_surplus:,.0f}，储蓄率 {ctx.savings_rate:.0%}，负债率 {ctx.debt_ratio:.0%}。",
    ]
    impact = []
    ret = pred.get("retirement") or {}
    if ret.get("available") and not ret.get("covered"):
        impact.append(f"若不调整，退休时预计缺口 ¥{ret['gap']:,.0f}。")
    goal = pred.get("goal") or {}
    if goal.get("available"):
        impact.append(f"当前节奏下财富目标达成概率约 {goal['probability']:.0%}。")
    # milestones 为 {1: …, 3: …, 5: …, 10: …, 20: …, 30: …}，明确取 10 年期；
    # 此前取 [-1]（30 年）当作「10 年后」展示。
    milestones = pred.get("milestones") if isinstance(pred.get("milestones"), dict) else {}
    ten_year = milestones.get(10) or {}
    impact.append(f"按现有假设，10 年后净资产约 ¥{ten_year.get('netWorth', 0):,.0f}。")
    advice = [a["title"] for bucket in buckets.values() for a in bucket if a["priority"] == "high"][:4]

    exp = make_explanation("财富策略总览", cause, impact, advice)
    high_priority_count = sum(1 for b in buckets.values() for a in b if a["priority"] == "high")
    if use_ai and high_priority_count >= 1:
        facts = json.dumps(
            {"score": score.get("totalScore"), "weakest": weakest, "strategies": buckets},
            ensure_ascii=False,
            default=str,
        )
        exp = enhance_with_llm(db, user, exp, facts=facts, complex_enough=True)

    return {
        "hasData": True,
        "horizons": [
            {"key": k, "label": HORIZON_LABELS[k], "actions": v} for k, v in buckets.items()
        ],
        "explanation": exp.to_dict(),
        "tier": exp.tier,
        "disclaimer": DISCLAIMER,
    }


def save_strategies(db: Session, user: User, result: dict) -> list[str]:
    if not result.get("hasData"):
        return []
    ids: list[str] = []
    for bucket in result.get("horizons", []):
        row = WealthStrategy(
            user_id=user.id,
            horizon=bucket["key"],
            plan_key="A",
            title=bucket["label"],
            actions=json.dumps(bucket["actions"], ensure_ascii=False),
            expected_effect=json.dumps(result.get("explanation", {}), ensure_ascii=False, default=str),
            tier=result.get("tier", "local"),
        )
        db.add(row)
        ids.append(row.id)
    db.commit()
    return ids


def list_strategies(db: Session, user: User, limit: int = 30) -> list[dict]:
    rows = db.scalars(
        select(WealthStrategy)
        .where(WealthStrategy.user_id == user.id)
        .order_by(WealthStrategy.created_at.desc())
        .limit(limit)
    ).all()
    out = []
    for r in rows:
        try:
            actions = json.loads(r.actions)
        except (json.JSONDecodeError, TypeError):
            actions = []
        out.append(
            {
                "id": r.id,
                "horizon": r.horizon,
                "planKey": r.plan_key,
                "title": r.title,
                "actions": actions,
                "tier": r.tier,
                "createdAt": r.created_at.isoformat() if r.created_at else None,
            }
        )
    return out
