"""六维财富健康评分（Phase 7.1 需求六）。

维度（各 0-100，加权得总分 0-100）：
  asset       资产结构（规模、分散度、负债率）
  cashflow    现金流（储蓄率、结余稳定性）
  risk        风险控制（集中度、负债、风险偏好匹配）
  goal        目标达成（目标完成度 + 达成概率）
  investment  投资效率（投资资产占比与风险偏好匹配度）
  protection  保障水平（应急金 + 保险类资产）

全部纯代码规则计算，零 LLM（需求十三）。每个维度都输出「原因」，
供 reasoning 层组装成「原因 / 影响 / 建议」三段式（需求九）。
"""
from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.intelligence.constants import DISCLAIMER, WELCOME_MESSAGE
from backend.intelligence.context import WealthContext
from backend.intelligence.models import HealthScoreHistory
from backend.user.models import User

WEIGHTS = {
    "asset": 0.20,
    "cashflow": 0.22,
    "risk": 0.18,
    "goal": 0.15,
    "investment": 0.13,
    "protection": 0.12,
}

LABELS = {
    "asset": "资产结构",
    "cashflow": "现金流",
    "risk": "风险控制",
    "goal": "目标达成",
    "investment": "投资效率",
    "protection": "保障水平",
}

TARGET_INVESTMENT_RATIO = {"conservative": 0.30, "balanced": 0.50, "aggressive": 0.70}


def _clamp(v: float) -> int:
    return int(max(0, min(100, round(v))))


def _score_asset(ctx: WealthContext) -> tuple[int, list[str]]:
    reasons: list[str] = []
    score = 50.0
    if ctx.net_worth <= 0:
        score = 20.0
        reasons.append("净资产为零或为负，资产结构尚未建立。")
    else:
        kinds = len([k for k, v in ctx.allocation_pct.items() if v > 0.02])
        if kinds >= 4:
            score += 20
            reasons.append(f"资产分布在 {kinds} 个类别，分散度良好。")
        elif kinds >= 2:
            score += 10
            reasons.append(f"资产覆盖 {kinds} 个类别，分散度一般。")
        else:
            score -= 10
            reasons.append("资产类别过于单一，抗风险能力不足。")
        if ctx.debt_ratio > 0.6:
            score -= 20
            reasons.append(f"负债率 {ctx.debt_ratio:.0%} 偏高，显著挤压净资产。")
        elif ctx.debt_ratio > 0.3:
            score -= 8
            reasons.append(f"负债率 {ctx.debt_ratio:.0%} 处于中等水平。")
        elif ctx.total_liabilities == 0:
            score += 10
            reasons.append("当前无负债记录，资产负债表健康。")
    return _clamp(score), reasons


def _score_cashflow(ctx: WealthContext) -> tuple[int, list[str]]:
    reasons: list[str] = []
    if ctx.monthly_income <= 0:
        return 30, ["未录入月收入，现金流无法有效评估。"]
    sr = ctx.savings_rate
    if sr >= 0.4:
        score, txt = 95.0, f"储蓄率 {sr:.0%}，现金流非常强劲。"
    elif sr >= 0.3:
        score, txt = 85.0, f"储蓄率 {sr:.0%}，处于优秀区间。"
    elif sr >= 0.2:
        score, txt = 72.0, f"储蓄率 {sr:.0%}，处于健康区间。"
    elif sr >= 0.1:
        score, txt = 58.0, f"储蓄率 {sr:.0%}，偏低但仍为正结余。"
    elif sr > 0:
        score, txt = 42.0, f"储蓄率仅 {sr:.0%}，抗风险空间很小。"
    else:
        score, txt = 15.0, "月度支出已超过收入，现金流为负，需要立即干预。"
    reasons.append(txt)
    reasons.append(f"当前月结余 ¥{ctx.monthly_surplus:,.0f}。")
    return _clamp(score), reasons


def _score_risk(ctx: WealthContext) -> tuple[int, list[str]]:
    reasons: list[str] = []
    score = 80.0
    top = max(ctx.allocation_pct.items(), key=lambda kv: kv[1], default=None)
    if top and top[1] >= 0.85:
        score -= 35
        reasons.append(f"「{top[0]}」占比 {top[1]:.0%}，集中度极高。")
    elif top and top[1] >= 0.7:
        score -= 20
        reasons.append(f"「{top[0]}」占比 {top[1]:.0%}，集中度偏高。")
    elif top:
        reasons.append(f"最大单类资产「{top[0]}」占比 {top[1]:.0%}，集中度可接受。")
    if ctx.debt_ratio > 0.5:
        score -= 20
        reasons.append(f"负债率 {ctx.debt_ratio:.0%}，杠杆风险需要关注。")
    if ctx.risk_level == "aggressive" and (ctx.emergency_months or 0) < 3:
        score -= 15
        reasons.append("激进风险偏好但应急金不足，风险承受与实际储备不匹配。")
    if not reasons:
        reasons.append("暂无明显风险信号。")
    return _clamp(score), reasons


def _score_goal(ctx: WealthContext, goal_result: dict | None) -> tuple[int, list[str]]:
    reasons: list[str] = []
    if not ctx.goal_amount:
        return 40, ["尚未设置可量化的财富目标（如「10年内攒够500万」），无法评估目标达成度。"]
    progress = min(1.0, ctx.net_worth / ctx.goal_amount) if ctx.goal_amount > 0 else 0.0
    score = progress * 60
    reasons.append(f"目标金额 ¥{ctx.goal_amount:,.0f}，当前完成度 {progress:.0%}。")
    if goal_result and goal_result.get("available"):
        prob = goal_result.get("probability", 0.0)
        score += prob * 40
        reasons.append(f"按当前节奏模拟，{goal_result['horizonYears']} 年内达成概率约 {prob:.0%}（{goal_result['probabilityLabel']}）。")
    else:
        score += 15
    return _clamp(score), reasons


def _score_investment(ctx: WealthContext) -> tuple[int, list[str]]:
    reasons: list[str] = []
    target = TARGET_INVESTMENT_RATIO.get(ctx.risk_level, 0.5)
    ratio = ctx.investment_ratio
    if ctx.total_assets <= 0:
        return 30, ["暂无资产记录，投资效率无法评估。"]
    diff = abs(ratio - target)
    score = 100 - diff / max(target, 0.01) * 60
    reasons.append(f"投资类资产占比 {ratio:.0%}，风险偏好「{ctx.risk_level}」的参考区间约 {target:.0%}。")
    if ratio < target * 0.5:
        reasons.append("投资比例明显偏低，长期资金可能跑输通胀。")
    elif ratio > target * 1.5:
        reasons.append("投资比例明显偏高，短期波动对净值影响较大。")
    else:
        reasons.append("投资比例与风险偏好基本匹配。")
    return _clamp(score), reasons


def _score_protection(ctx: WealthContext) -> tuple[int, list[str]]:
    reasons: list[str] = []
    score = 40.0
    em = ctx.emergency_months
    if em is None:
        reasons.append("未录入月支出，无法计算应急金覆盖月数。")
    elif em >= 6:
        score += 35
        reasons.append(f"应急金可覆盖 {em} 个月支出，流动性充足。")
    elif em >= 3:
        score += 20
        reasons.append(f"应急金可覆盖 {em} 个月支出，基本达标。")
    else:
        score -= 10
        reasons.append(f"应急金仅覆盖 {em} 个月支出，低于 3 个月安全线。")
    if ctx.protection_amount > 0:
        score += 25
        reasons.append(f"已配置保障类资产 ¥{ctx.protection_amount:,.0f}。")
    else:
        reasons.append("未记录保险/年金等保障类资产，风险敞口未对冲。")
    return _clamp(score), reasons


def score_wealth(ctx: WealthContext, goal_result: dict | None = None) -> dict:
    """六维评分总入口。无数据返回欢迎态（绝不给假分数）。"""
    if not ctx.has_data:
        return {"hasData": False, "message": WELCOME_MESSAGE, "disclaimer": DISCLAIMER}

    computed = {
        "asset": _score_asset(ctx),
        "cashflow": _score_cashflow(ctx),
        "risk": _score_risk(ctx),
        "goal": _score_goal(ctx, goal_result),
        "investment": _score_investment(ctx),
        "protection": _score_protection(ctx),
    }
    dimensions = []
    total = 0.0
    for key, (val, reasons) in computed.items():
        total += val * WEIGHTS[key]
        dimensions.append(
            {
                "key": key,
                "label": LABELS[key],
                "score": val,
                "weight": WEIGHTS[key],
                "level": _level(val),
                "reasons": reasons,
            }
        )
    total_score = _clamp(total)
    weakest = min(dimensions, key=lambda d: d["score"])
    strongest = max(dimensions, key=lambda d: d["score"])

    return {
        "hasData": True,
        "totalScore": total_score,
        "level": _level(total_score),
        "dimensions": dimensions,
        "weakest": {"key": weakest["key"], "label": weakest["label"], "score": weakest["score"]},
        "strongest": {"key": strongest["key"], "label": strongest["label"], "score": strongest["score"]},
        "method": "规则化六维加权评分（零 LLM，纯代码计算）",
        "disclaimer": DISCLAIMER,
    }


def _level(score: float) -> str:
    if score >= 85:
        return "优秀"
    if score >= 70:
        return "良好"
    if score >= 55:
        return "一般"
    if score >= 40:
        return "偏弱"
    return "亟需改善"


def save_score(db: Session, user: User, result: dict) -> str | None:
    """写入评分历史，返回记录 id。无数据不写。"""
    if not result.get("hasData"):
        return None
    by_key = {d["key"]: d["score"] for d in result.get("dimensions", [])}
    row = HealthScoreHistory(
        user_id=user.id,
        total_score=result.get("totalScore", 0),
        asset_score=by_key.get("asset", 0),
        cashflow_score=by_key.get("cashflow", 0),
        risk_score=by_key.get("risk", 0),
        goal_score=by_key.get("goal", 0),
        investment_score=by_key.get("investment", 0),
        protection_score=by_key.get("protection", 0),
        detail=json.dumps(result.get("dimensions", []), ensure_ascii=False),
    )
    db.add(row)
    db.commit()
    return row.id


def score_history(db: Session, user: User, limit: int = 20) -> list[dict]:
    rows = db.scalars(
        select(HealthScoreHistory)
        .where(HealthScoreHistory.user_id == user.id)
        .order_by(HealthScoreHistory.created_at.desc())
        .limit(limit)
    ).all()
    return [
        {
            "id": r.id,
            "totalScore": r.total_score,
            "asset": r.asset_score,
            "cashflow": r.cashflow_score,
            "risk": r.risk_score,
            "goal": r.goal_score,
            "investment": r.investment_score,
            "protection": r.protection_score,
            "createdAt": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
