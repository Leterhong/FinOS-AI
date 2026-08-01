# -*- coding: utf-8 -*-
"""
主动陪伴系统：每日财富日报（DailyBriefing） + AI 决策记录（DecisionJournal） + 方案历史版本（PlanVersion）。

日报根据用户财富变化 / 目标 / 风险变化主动生成，不等待用户提问。
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy import select

from backend.financial.models import Asset, FinancialProfile
from backend.financial.twin_engine import WELCOME_MESSAGE, compute_twin
from backend.intelligence.ltm.service import recall
from backend.notification.models import Notification
from backend.personal_os.models import DailyBriefing, DecisionJournal, PlanVersion
from backend.user.models import User


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _greeting() -> str:
    h = datetime.now(timezone.utc).hour
    if h < 11:
        return "早安"
    if h < 18:
        return "午安"
    return "晚安"


def generate_briefing(user: User, db, force: bool = False) -> dict:
    today = _today()
    existing = db.scalar(
        select(DailyBriefing).where(DailyBriefing.user_id == user.id, DailyBriefing.brief_date == today)
    )
    if existing and not force:
        return _serialize_briefing(existing)

    profile = db.scalar(select(FinancialProfile).where(FinancialProfile.user_id == user.id))
    assets = list(db.scalars(select(Asset).where(Asset.user_id == user.id)).all())
    twin = compute_twin(profile, assets)
    if not twin.get("hasData"):
        b = existing or DailyBriefing(user_id=user.id, brief_date=today)
        b.greeting = _greeting()
        b.wealth_change = WELCOME_MESSAGE
        b.reminders = "暂无提醒"
        b.actions = "完善你的财富资料，开启 AI 陪伴。"
        b.tone = "neutral"
        b.payload = "{}"
        db.add(b) if existing is None else None
        db.commit()
        return _serialize_briefing(b)

    # 财富变化：对比上次日报记录的净值
    last = db.scalar(
        select(DailyBriefing)
        .where(DailyBriefing.user_id == user.id, DailyBriefing.brief_date < today)
        .order_by(DailyBriefing.brief_date.desc())
    )
    prev_nw = None
    if last and last.payload:
        try:
            prev_nw = json.loads(last.payload).get("netWorth")
        except (json.JSONDecodeError, TypeError):
            prev_nw = None
    cur_nw = twin["netWorth"]
    if prev_nw is not None and prev_nw != 0:
        chg = (cur_nw - prev_nw) / abs(prev_nw)
        wealth_change = (
            f"你的净资产由 ¥{abs(prev_nw):,.0f} 变动至 ¥{cur_nw:,.0f}（{chg:+.1%}）。"
            + ("建议继续保持当前储蓄与投资策略。" if chg >= 0 else "建议关注风险，审视近期支出与持仓。")
        )
        tone = "positive" if chg >= 0 else "warning"
    else:
        wealth_change = f"当前净资产 ¥{cur_nw:,.0f}，财富健康分 {twin['healthScore']}。"
        tone = "neutral"

    # 提醒：未读且严重的通知
    notifs = list(
        db.scalars(
            select(Notification)
            .where(Notification.user_id == user.id, Notification.read.is_(False))
            .order_by(Notification.created_at.desc())
            .limit(20)
        ).all()
    )
    critical = [n for n in notifs if n.severity in ("warn", "critical")]
    if critical:
        reminders = "；".join(f"{n.title}" for n in critical[:3])
        if tone == "neutral":
            tone = "warning"
    else:
        reminders = "暂无重大风险提醒，继续保持。"

    # 行动：来自记忆中的目标 / 最近决策
    goals = recall(db, user, kinds=("preference",), limit=5, mark_hit=False)
    goal_text = next((g["content"] for g in goals if "目标" in g["content"]), None)
    actions = f"今日行动：{goal_text}。" if goal_text else "今日行动：检查本月预算，保持储蓄计划。"

    b = existing or DailyBriefing(user_id=user.id, brief_date=today)
    b.greeting = _greeting()
    b.wealth_change = wealth_change
    b.reminders = reminders
    b.actions = actions
    b.tone = tone
    b.payload = json.dumps({"netWorth": cur_nw, "healthScore": twin["healthScore"]}, ensure_ascii=False)
    if existing is None:
        db.add(b)
    db.commit()
    return _serialize_briefing(b)


def _serialize_briefing(b: DailyBriefing) -> dict:
    return {
        "id": b.id,
        "date": b.brief_date,
        "greeting": b.greeting,
        "wealthChange": b.wealth_change,
        "reminders": b.reminders,
        "actions": b.actions,
        "tone": b.tone,
    }


# ---------------- 决策记录 ----------------
def add_decision(
    user: User, db, question: str, analysis: str, recommendation: str, chosen_plan: str, alternatives: str = ""
) -> dict:
    d = DecisionJournal(
        user_id=user.id,
        question=question,
        analysis=analysis,
        recommendation=recommendation,
        chosen_plan=chosen_plan,
        alternatives=alternatives,
    )
    db.add(d)
    db.commit()
    return _serialize_decision(d)


def list_decisions(user: User, db, limit: int = 50) -> list[dict]:
    rows = list(
        db.scalars(
            select(DecisionJournal)
            .where(DecisionJournal.user_id == user.id)
            .order_by(DecisionJournal.created_at.desc())
            .limit(limit)
        ).all()
    )
    return [_serialize_decision(r) for r in rows]


def _serialize_decision(d: DecisionJournal) -> dict:
    return {
        "id": d.id,
        "question": d.question,
        "analysis": d.analysis,
        "recommendation": d.recommendation,
        "chosenPlan": d.chosen_plan,
        "alternatives": d.alternatives,
        "createdAt": d.created_at.isoformat() if d.created_at else None,
    }


# ---------------- 方案版本 ----------------
def add_plan_version(
    user: User, db, subject: str, version: int, title: str, content: str, change_note: str = ""
) -> dict:
    pv = PlanVersion(
        user_id=user.id,
        subject=subject[:40],
        version=int(version),
        title=title[:200],
        content=content,
        change_note=change_note,
    )
    db.add(pv)
    db.commit()
    return _serialize_plan(pv)


def list_plan_versions(user: User, db, subject: str | None = None) -> list[dict]:
    stmt = select(PlanVersion).where(PlanVersion.user_id == user.id)
    if subject:
        stmt = stmt.where(PlanVersion.subject == subject)
    rows = list(db.scalars(stmt.order_by(PlanVersion.subject, PlanVersion.version.desc())).all())
    return [_serialize_plan(r) for r in rows]


def _serialize_plan(p: PlanVersion) -> dict:
    return {
        "id": p.id,
        "subject": p.subject,
        "version": p.version,
        "title": p.title,
        "content": p.content,
        "changeNote": p.change_note,
        "createdAt": p.created_at.isoformat() if p.created_at else None,
    }
