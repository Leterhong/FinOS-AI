# -*- coding: utf-8 -*-
"""
Phase 7.3 FinOS AI Personal OS — API 路由。

前缀 /personal-os。全部端点强制 user_id（经 get_current_user）。
覆盖：Avatar / Timeline / Memory / Command Center / Knowledge / Briefing / Decision /
Plan Version / Global Search / Privacy Center。
"""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.core import get_current_user, ok
from backend.core.response import fail
from backend.database import get_db
from backend.financial.models import Asset, FinancialProfile
from backend.intelligence.models import LongTermMemory
from backend.report.models import WealthReport
from backend.notification.models import Notification
from backend.personal_os import avatar as avatar_svc
from backend.personal_os import briefing as briefing_svc
from backend.personal_os import command_center as cc_svc
from backend.personal_os import knowledge as knowledge_svc
from backend.personal_os import memory as memory_svc
from backend.personal_os import search as search_svc
from backend.personal_os import timeline as timeline_svc
from backend.personal_os.models import (
    DecisionJournal,
    KnowledgeItem,
    PlanVersion,
    TimelineEvent,
    WealthAvatar,
)
from backend.user.models import User

router = APIRouter(prefix="/personal-os", tags=["personal-os"])


# ---------- 请求体 ----------
class RenameAvatar(BaseModel):
    avatarName: str = "我的财富分身"


class AddEvent(BaseModel):
    title: str
    category: str = "future"
    eventDate: str = ""
    description: str = ""


class AddMemory(BaseModel):
    kind: str
    key: str
    content: str
    payload: dict | None = None
    importance: float = 0.5


class UpdateMemory(BaseModel):
    content: str
    payload: dict | None = None


class AddKnowledge(BaseModel):
    title: str
    content: str
    source: str = "upload"
    category: str = "general"
    tags: list[str] | None = None
    sourceRef: str = ""


class UpdateKnowledge(BaseModel):
    title: str | None = None
    content: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    source: str | None = None


class AddDecision(BaseModel):
    question: str
    analysis: str = ""
    recommendation: str = ""
    chosenPlan: str = ""
    alternatives: str = ""


class AddPlanVersion(BaseModel):
    subject: str
    version: int = 1
    title: str
    content: str
    changeNote: str = ""


# ---------- Avatar ----------
@router.get("/avatar")
def get_avatar(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok(avatar_svc.build_avatar(user, db))


@router.post("/avatar")
def rename_avatar(body: RenameAvatar, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok(avatar_svc.rename_avatar(user, db, body.avatarName))


# ---------- Timeline ----------
@router.get("/timeline")
def get_timeline(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok(timeline_svc.build_timeline(user, db))


@router.post("/timeline/events")
def add_timeline_event(body: AddEvent, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok(timeline_svc.add_event(user, db, body.title, body.category, body.eventDate, body.description))


@router.delete("/timeline/events/{event_id}")
def delete_timeline_event(event_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not timeline_svc.delete_event(user, db, event_id):
        return fail("事件不存在或不可删除", status_code=404)
    return ok(None, "已删除")


# ---------- Memory Center ----------
@router.get("/memory")
def list_memory(kind: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok(memory_svc.list_memories(user, db, kind))


@router.post("/memory")
def add_memory(body: AddMemory, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return ok(memory_svc.add_memory(user, db, body.kind, body.key, body.content, body.payload, body.importance))
    except ValueError as e:
        return fail(str(e), status_code=400)


@router.put("/memory/{memory_id}")
def update_memory(
    memory_id: str, body: UpdateMemory, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    res = memory_svc.update_memory(user, db, memory_id, body.content, body.payload)
    if res is None:
        return fail("记忆不存在", status_code=404)
    return ok(res)


@router.delete("/memory/{memory_id}")
def delete_memory(memory_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not memory_svc.remove_memory(user, db, memory_id):
        return fail("记忆不存在", status_code=404)
    return ok(None, "已删除")


# ---------- Command Center (首页驾驶舱) ----------
@router.get("/command-center")
def command_center(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok(cc_svc.get_dashboard(user, db))


# ---------- Knowledge Center ----------
@router.get("/knowledge")
def list_knowledge(
    category: str | None = None,
    favorite: bool | None = None,
    q: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ok({"items": knowledge_svc.list_items(user, db, category, favorite, q)})


@router.post("/knowledge")
def add_knowledge(body: AddKnowledge, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok(knowledge_svc.add_item(user, db, body.title, body.content, body.source, body.category, body.tags, body.sourceRef))


@router.put("/knowledge/{item_id}")
def update_knowledge(
    item_id: str, body: UpdateKnowledge, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    fields = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    res = knowledge_svc.update_item(user, db, item_id, **fields)
    if res is None:
        return fail("知识条目不存在", status_code=404)
    return ok(res)


@router.post("/knowledge/{item_id}/favorite")
def toggle_favorite(item_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    res = knowledge_svc.toggle_favorite(user, db, item_id)
    if res is None:
        return fail("知识条目不存在", status_code=404)
    return ok(res)


@router.delete("/knowledge/{item_id}")
def delete_knowledge(item_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not knowledge_svc.remove_item(user, db, item_id):
        return fail("知识条目不存在", status_code=404)
    return ok(None, "已删除")


# ---------- Briefing (主动陪伴日报) ----------
@router.get("/briefing")
def get_briefing(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok(briefing_svc.generate_briefing(user, db))


@router.post("/briefing/generate")
def regenerate_briefing(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok(briefing_svc.generate_briefing(user, db, force=True))


# ---------- Decision Journal ----------
@router.get("/decisions")
def list_decisions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok({"items": briefing_svc.list_decisions(user, db)})


@router.post("/decisions")
def add_decision(body: AddDecision, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok(
        briefing_svc.add_decision(
            user, db, body.question, body.analysis, body.recommendation, body.chosenPlan, body.alternatives
        )
    )


# ---------- Plan Versions ----------
@router.get("/plan-versions")
def list_plan_versions(subject: str | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok({"items": briefing_svc.list_plan_versions(user, db, subject)})


@router.post("/plan-versions")
def add_plan_version(body: AddPlanVersion, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok(
        briefing_svc.add_plan_version(user, db, body.subject, body.version, body.title, body.content, body.changeNote)
    )


# ---------- Global Search ----------
@router.get("/search")
def global_search(q: str = "", user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not q.strip():
        return ok({"query": q, "results": {}, "total": 0})
    return ok(search_svc.global_search(user, db, q))


# ---------- Privacy Center ----------
@router.get("/privacy/export")
def export_data(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = db.scalar(select(FinancialProfile).where(FinancialProfile.user_id == user.id))
    assets = [{"name": a.name, "type": a.type, "amount": a.amount} for a in db.scalars(select(Asset).where(Asset.user_id == user.id)).all()]
    avatar = db.scalar(select(WealthAvatar).where(WealthAvatar.user_id == user.id))
    memories = [
        {"kind": m.kind, "key": m.key, "content": m.content}
        for m in db.scalars(select(LongTermMemory).where(LongTermMemory.user_id == user.id)).all()
    ]
    timeline = [
        {"title": e.title, "category": e.category, "eventDate": e.event_date}
        for e in db.scalars(select(TimelineEvent).where(TimelineEvent.user_id == user.id)).all()
    ]
    knowledge = [
        {"title": k.title, "source": k.source, "category": k.category}
        for k in db.scalars(select(KnowledgeItem).where(KnowledgeItem.user_id == user.id)).all()
    ]
    decisions = [
        {"question": d.question, "chosenPlan": d.chosen_plan}
        for d in db.scalars(select(DecisionJournal).where(DecisionJournal.user_id == user.id)).all()
    ]
    plans = [
        {"subject": p.subject, "version": p.version, "title": p.title}
        for p in db.scalars(select(PlanVersion).where(PlanVersion.user_id == user.id)).all()
    ]
    reports = [
        {"title": r.title, "kind": r.kind} for r in db.scalars(select(WealthReport).where(WealthReport.user_id == user.id)).all()
    ]
    notifications = [
        {"title": n.title, "category": n.category, "severity": n.severity}
        for n in db.scalars(select(Notification).where(Notification.user_id == user.id)).all()
    ]
    payload = {
        "user": {"email": user.email, "name": getattr(user, "name", "") or ""},
        "profile": {"income": float(profile.income) if profile else None, "expense": float(profile.expense) if profile else None, "goal": profile.goal if profile else None, "riskLevel": profile.risk_level if profile else None} if profile else None,
        "assets": assets,
        "avatar": {"name": avatar.avatar_name, "summary": avatar.profile_summary} if avatar else None,
        "memories": memories,
        "timeline": timeline,
        "knowledge": knowledge,
        "decisions": decisions,
        "planVersions": plans,
        "reports": reports,
        "notifications": notifications,
    }
    return ok({"exportedAt": _now_iso(), "data": payload})


@router.delete("/privacy/memory")
def clear_memory(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(LongTermMemory).where(LongTermMemory.user_id == user.id)).all()
    for r in rows:
        db.delete(r)
    db.commit()
    return ok({"deleted": len(rows)}, "已清空 AI 记忆")


def _now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()
