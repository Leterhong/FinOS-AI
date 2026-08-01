# -*- coding: utf-8 -*-
"""
backend/autonomous/agents/preference.py — Phase 7.4 需求十：AI 学习用户偏好
（Preference Learning）。

从用户的真实行为里学习四个维度，并持久化为画像：
    risk_tolerance      风险偏好（档案声明 + 行为修正）
    advice_acceptance   建议接受度（完成 / 忽略 / 延期 的分布）
    focus_areas         关注领域（哪一类建议最常被采纳）
    notify_timing       提醒时机（用户通常在几点处理行动项）

学习完全基于统计，零 Token；样本不足时给出低置信度而不是编造结论。
学习结果反过来影响自动化：接受度低 → 减少打扰；关注领域 → 提高该类优先级。
"""
from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.autonomous.models import AutomationAction, AutomationPreference
from backend.intelligence.context import build_context
from backend.user.models import User

AGENT_KEY = "preference"
AGENT_NAME = "偏好学习智能体"

DIMENSIONS = ("risk_tolerance", "advice_acceptance", "focus_areas", "notify_timing")

_CATEGORY_LABEL = {
    "wealth": "财富增长",
    "risk": "风险控制",
    "goal": "目标达成",
    "ai": "AI 建议",
    "system": "系统事项",
}


def _upsert(db: Session, user_id: str, dimension: str, value, confidence: float, samples: int) -> AutomationPreference:
    row = db.scalar(
        select(AutomationPreference).where(
            AutomationPreference.user_id == user_id,
            AutomationPreference.dimension == dimension,
        )
    )
    if row is None:
        row = AutomationPreference(user_id=user_id, dimension=dimension)
        db.add(row)
    row.set_value(value)
    row.confidence = round(max(0.0, min(1.0, confidence)), 3)
    row.sample_count = samples
    row.updated_at = datetime.now(timezone.utc)
    return row


def learn(db: Session, user: User, *, commit: bool = True) -> dict:
    """跑一轮偏好学习，返回学习结果。"""
    actions = list(
        db.scalars(select(AutomationAction).where(AutomationAction.user_id == user.id)).all()
    )
    done = [a for a in actions if a.status == "done"]
    dismissed = [a for a in actions if a.status == "dismissed"]
    deferred = [a for a in actions if a.status == "deferred"]
    decided = len(done) + len(dismissed) + len(deferred)

    # 1) 建议接受度
    acceptance = round(len(done) / decided, 4) if decided else 0.0
    acc_conf = min(1.0, decided / 10.0)
    acc_value = {
        "acceptanceRate": acceptance,
        "done": len(done),
        "dismissed": len(dismissed),
        "deferred": len(deferred),
        "pending": len([a for a in actions if a.status == "pending"]),
        "label": (
            "高度采纳" if acceptance >= 0.7 else "选择性采纳" if acceptance >= 0.4 else "较少采纳"
        )
        if decided
        else "样本不足",
    }
    _upsert(db, user.id, "advice_acceptance", acc_value, acc_conf, decided)

    # 2) 关注领域（按完成情况加权）
    counter: Counter = Counter()
    for a in done:
        counter[a.category or "system"] += 2
    for a in deferred:
        counter[a.category or "system"] += 1
    for a in dismissed:
        counter[a.category or "system"] -= 1
    ranked = [
        {"category": c, "label": _CATEGORY_LABEL.get(c, c), "score": s}
        for c, s in counter.most_common()
        if s > 0
    ]
    focus_value = {"areas": ranked[:3], "top": ranked[0]["label"] if ranked else None}
    _upsert(db, user.id, "focus_areas", focus_value, min(1.0, len(done) / 6.0), len(done))

    # 3) 提醒时机（用户实际处理行动项的小时分布）
    hours = Counter()
    for a in done:
        ts = a.completed_at or a.created_at
        if ts:
            hours[(ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)).hour] += 1
    best_hour = hours.most_common(1)[0][0] if hours else None
    timing_value = {
        "preferredHourUtc": best_hour,
        "distribution": dict(sorted(hours.items())),
        "label": f"通常在 UTC {best_hour}:00 前后处理" if best_hour is not None else "样本不足",
    }
    _upsert(db, user.id, "notify_timing", timing_value, min(1.0, sum(hours.values()) / 8.0), sum(hours.values()))

    # 4) 风险偏好（档案声明 + 行为修正）
    ctx = build_context(db, user)
    declared = ctx.risk_level or "balanced"
    risk_done = len([a for a in done if a.category == "risk"])
    risk_dismissed = len([a for a in dismissed if a.category == "risk"])
    behavioral = declared
    note = "与档案声明一致"
    if risk_done + risk_dismissed >= 3:
        if risk_dismissed > risk_done * 2:
            behavioral = "aggressive" if declared == "balanced" else declared
            note = "多次忽略风险类建议，实际行为更偏进取"
        elif risk_done > risk_dismissed * 2:
            behavioral = "conservative" if declared == "balanced" else declared
            note = "积极采纳风险类建议，实际行为更偏稳健"
    risk_value = {
        "declared": declared,
        "behavioral": behavioral,
        "note": note,
        "riskActionsDone": risk_done,
        "riskActionsDismissed": risk_dismissed,
    }
    _upsert(db, user.id, "risk_tolerance", risk_value, min(1.0, (risk_done + risk_dismissed) / 5.0), risk_done + risk_dismissed)

    if commit:
        db.commit()

    return get_profile(db, user)


def get_profile(db: Session, user: User) -> dict:
    rows = list(
        db.scalars(select(AutomationPreference).where(AutomationPreference.user_id == user.id)).all()
    )
    by_dim = {r.dimension: r for r in rows}
    out = {
        "agent": AGENT_KEY,
        "agentName": AGENT_NAME,
        "dimensions": [],
        "learned": bool(rows),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }
    for dim in DIMENSIONS:
        r = by_dim.get(dim)
        out["dimensions"].append(
            {
                "dimension": dim,
                "value": r.value_dict() if r else {},
                "confidence": r.confidence if r else 0.0,
                "sampleCount": r.sample_count if r else 0,
                "updatedAt": r.updated_at.isoformat() if r and r.updated_at else None,
            }
        )
    return out


def notification_bias(db: Session, user: User) -> dict:
    """把学习结果转换成自动化的行为偏置（供调度与提醒使用）。"""
    prof = {d["dimension"]: d for d in get_profile(db, user)["dimensions"]}
    acc = prof.get("advice_acceptance", {})
    acc_val = acc.get("value") or {}
    rate = float(acc_val.get("acceptanceRate") or 0.0)
    samples = int(acc.get("sampleCount") or 0)

    # 接受度低且样本足够 → 只推 high 以上，减少打扰
    if samples >= 8 and rate < 0.3:
        min_priority = "high"
        note = "检测到你较少采纳提醒，已自动降低打扰频率（仅推送重要及以上）"
    elif samples >= 8 and rate >= 0.7:
        min_priority = "low"
        note = "你对建议采纳度较高，已保持完整提醒"
    else:
        min_priority = "medium"
        note = "样本仍在积累中，采用默认提醒强度"

    focus = (prof.get("focus_areas", {}).get("value") or {}).get("areas") or []
    return {
        "minPriority": min_priority,
        "note": note,
        "boostCategories": [a["category"] for a in focus[:2]],
    }
