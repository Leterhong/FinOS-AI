# -*- coding: utf-8 -*-
"""
全局搜索 Global Search：跨 资产 / 报告 / 记忆 / 时间线 / 知识 / 通知 / 文件 聚合检索。
用户隔离：所有查询强制 user_id。
"""
from __future__ import annotations

from sqlalchemy import select

from backend.financial.models import Asset, FinancialProfile
from backend.intelligence.models import LongTermMemory
from backend.multimodal.models import MultimodalInput
from backend.notification.models import Notification
from backend.personal_os.models import (
    DecisionJournal,
    KnowledgeItem,
    PlanVersion,
    TimelineEvent,
)
from backend.report.models import WealthReport
from backend.user.models import User


def global_search(user: User, db, q: str, limit: int = 8) -> dict:
    ql = (q or "").strip().lower()
    if not ql:
        # 保持与命中分支同构，前端可无条件读取 total
        return {"query": q, "results": {}, "total": 0}

    def _hit(text: str | None) -> bool:
        return bool(text) and ql in text.lower()

    results: dict[str, list[dict]] = {}

    # 资产
    assets = db.scalars(select(Asset).where(Asset.user_id == user.id)).all()
    asset_hits = [
        {"id": a.id, "type": "asset", "title": a.name or a.type, "detail": f"{a.type} · ¥{a.amount:,.0f}"}
        for a in assets
        if _hit(a.name) or _hit(a.type) or _hit(a.note if hasattr(a, "note") else None)
    ]
    if asset_hits:
        results["assets"] = asset_hits[:limit]

    # 报告
    reports = db.scalars(select(WealthReport).where(WealthReport.user_id == user.id)).all()
    rep_hits = [
        {"id": r.id, "type": "report", "title": r.title or r.kind, "detail": r.kind}
        for r in reports
        if _hit(r.title) or _hit(r.kind) or _hit(r.content)
    ]
    if rep_hits:
        results["reports"] = rep_hits[:limit]

    # 记忆
    mems = db.scalars(select(LongTermMemory).where(LongTermMemory.user_id == user.id)).all()
    mem_hits = [
        {"id": m.id, "type": "memory", "title": m.key, "detail": m.content[:80]}
        for m in mems
        if _hit(m.key) or _hit(m.content)
    ]
    if mem_hits:
        results["memories"] = mem_hits[:limit]

    # 时间线
    evs = db.scalars(select(TimelineEvent).where(TimelineEvent.user_id == user.id)).all()
    ev_hits = [
        {"id": e.id, "type": "timeline", "title": e.title, "detail": e.description[:80]}
        for e in evs
        if _hit(e.title) or _hit(e.description)
    ]
    if ev_hits:
        results["timeline"] = ev_hits[:limit]

    # 知识
    kns = db.scalars(select(KnowledgeItem).where(KnowledgeItem.user_id == user.id)).all()
    kn_hits = [
        {"id": k.id, "type": "knowledge", "title": k.title, "detail": k.content[:80]}
        for k in kns
        if _hit(k.title) or _hit(k.content)
    ]
    if kn_hits:
        results["knowledge"] = kn_hits[:limit]

    # 通知
    nots = db.scalars(select(Notification).where(Notification.user_id == user.id)).all()
    not_hits = [
        {"id": n.id, "type": "notification", "title": n.title, "detail": n.body[:80]}
        for n in nots
        if _hit(n.title) or _hit(n.body)
    ]
    if not_hits:
        results["notifications"] = not_hits[:limit]

    # 决策记录（Phase 7.3）
    decs = db.scalars(select(DecisionJournal).where(DecisionJournal.user_id == user.id)).all()
    dec_hits = [
        {
            "id": d.id,
            "type": "decision",
            "title": (d.question or "未命名决策")[:60],
            "detail": (d.recommendation or d.chosen_plan or d.analysis or "")[:80],
        }
        for d in decs
        if _hit(d.question) or _hit(d.analysis) or _hit(d.recommendation) or _hit(d.chosen_plan) or _hit(d.alternatives)
    ]
    if dec_hits:
        results["decisions"] = dec_hits[:limit]

    # 方案版本（Phase 7.3）
    plans = db.scalars(select(PlanVersion).where(PlanVersion.user_id == user.id)).all()
    plan_hits = [
        {
            "id": p.id,
            "type": "plan",
            "title": f"{p.title or p.subject} · v{p.version}",
            "detail": (p.change_note or p.content or "")[:80],
        }
        for p in plans
        if _hit(p.title) or _hit(p.content) or _hit(p.subject) or _hit(p.change_note)
    ]
    if plan_hits:
        results["plans"] = plan_hits[:limit]

    # 财富目标（来自财富档案，用户常按目标关键词回溯）
    profile = db.scalar(select(FinancialProfile).where(FinancialProfile.user_id == user.id))
    if profile is not None and _hit(profile.goal):
        results["goals"] = [
            {
                "id": profile.id,
                "type": "goal",
                "title": "我的财富目标",
                "detail": (profile.goal or "")[:80],
            }
        ]

    # 文件
    files = db.scalars(select(MultimodalInput).where(MultimodalInput.user_id == user.id)).all()
    file_hits = [
        {"id": f.id, "type": "file", "title": f.filename or f.modality, "detail": f.summary[:80]}
        for f in files
        if _hit(f.filename) or _hit(f.summary)
    ]
    if file_hits:
        results["files"] = file_hits[:limit]

    return {"query": q, "results": results, "total": sum(len(v) for v in results.values())}
