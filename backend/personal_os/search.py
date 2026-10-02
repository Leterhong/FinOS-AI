# -*- coding: utf-8 -*-
"""
全局搜索 Global Search：跨 资产 / 报告 / 记忆 / 时间线 / 知识 / 通知 / 文件 聚合检索。
用户隔离：所有查询强制 user_id。
"""
from __future__ import annotations

from sqlalchemy import or_, select

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


def _like(q: str) -> str:
    """转义 LIKE 通配符，避免用户输入的 % / _ 变成通配。"""
    escaped = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def global_search(user: User, db, q: str, limit: int = 8) -> dict:
    ql = (q or "").strip()
    if not ql:
        return {"query": q, "results": {}, "total": 0}
    pattern = _like(ql)

    def search(model, columns, build) -> list[dict]:
        # SQL 侧过滤 + 限制条数，避免把整表（含大 Text 字段）读进内存再过滤。
        stmt = (
            select(model)
            .where(model.user_id == user.id)
            .where(or_(*[column.ilike(pattern, escape="\\") for column in columns]))
            .limit(limit)
        )
        return [build(row) for row in db.scalars(stmt)]

    def _hit(text: str | None) -> bool:
        return bool(text) and ql.lower() in text.lower()

    results: dict[str, list[dict]] = {}

    hits = search(
        Asset,
        [Asset.name, Asset.type],
        lambda a: {"id": a.id, "type": "asset", "title": a.name or a.type, "detail": f"{a.type} · ¥{a.amount:,.0f}"},
    )
    if hits:
        results["assets"] = hits

    hits = search(
        WealthReport,
        [WealthReport.title, WealthReport.kind, WealthReport.content],
        lambda r: {"id": r.id, "type": "report", "title": r.title or r.kind, "detail": r.kind},
    )
    if hits:
        results["reports"] = hits

    hits = search(
        LongTermMemory,
        [LongTermMemory.key, LongTermMemory.content],
        lambda m: {"id": m.id, "type": "memory", "title": m.key, "detail": m.content[:80] if m.content else ""},
    )
    if hits:
        results["memories"] = hits

    hits = search(
        TimelineEvent,
        [TimelineEvent.title, TimelineEvent.description],
        lambda e: {"id": e.id, "type": "timeline", "title": e.title, "detail": (e.description or "")[:80]},
    )
    if hits:
        results["timeline"] = hits

    hits = search(
        KnowledgeItem,
        [KnowledgeItem.title, KnowledgeItem.content],
        lambda k: {"id": k.id, "type": "knowledge", "title": k.title, "detail": (k.content or "")[:80]},
    )
    if hits:
        results["knowledge"] = hits

    hits = search(
        Notification,
        [Notification.title, Notification.body],
        lambda n: {"id": n.id, "type": "notification", "title": n.title, "detail": (n.body or "")[:80]},
    )
    if hits:
        results["notifications"] = hits

    hits = search(
        DecisionJournal,
        [DecisionJournal.question, DecisionJournal.analysis, DecisionJournal.recommendation, DecisionJournal.chosen_plan, DecisionJournal.alternatives],
        lambda d: {
            "id": d.id,
            "type": "decision",
            "title": (d.question or "未命名决策")[:60],
            "detail": (d.recommendation or d.chosen_plan or d.analysis or "")[:80],
        },
    )
    if hits:
        results["decisions"] = hits

    hits = search(
        PlanVersion,
        [PlanVersion.title, PlanVersion.content, PlanVersion.subject, PlanVersion.change_note],
        lambda p: {
            "id": p.id,
            "type": "plan",
            "title": f"{p.title or p.subject} · v{p.version}",
            "detail": (p.change_note or p.content or "")[:80],
        },
    )
    if hits:
        results["plans"] = hits

    # 财富目标：单行记录，保持 Python 匹配（字段可能为加密列，SQL 过滤不可靠）。
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

    hits = search(
        MultimodalInput,
        [MultimodalInput.filename, MultimodalInput.summary],
        lambda f: {"id": f.id, "type": "file", "title": f.filename or f.modality, "detail": (f.summary or "")[:80]},
    )
    if hits:
        results["files"] = hits

    return {"query": q, "results": results, "total": sum(len(v) for v in results.values())}
