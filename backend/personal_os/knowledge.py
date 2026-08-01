# -*- coding: utf-8 -*-
"""
个人财富知识中心 Knowledge Center 服务。

来源 source：upload（用户上传） / ai（AI 生成） / report（历史报告）。
支持：搜索 / 分类 / 收藏。
"""
from __future__ import annotations

import json

from sqlalchemy import select

from backend.personal_os.models import KnowledgeItem
from backend.user.models import User

ALLOWED_SOURCES = {"upload", "ai", "report"}


def _serialize(k: KnowledgeItem) -> dict:
    try:
        tags = json.loads(k.tags) if k.tags else []
    except (json.JSONDecodeError, TypeError):
        tags = []
    return {
        "id": k.id,
        "title": k.title,
        "content": k.content,
        "source": k.source,
        "sourceRef": k.source_ref,
        "category": k.category,
        "tags": tags,
        "favorite": k.favorite,
        "createdAt": k.created_at.isoformat() if k.created_at else None,
        "updatedAt": k.updated_at.isoformat() if k.updated_at else None,
    }


def list_items(
    user: User, db, category: str | None = None, favorite: bool | None = None, q: str | None = None
) -> list[dict]:
    stmt = select(KnowledgeItem).where(KnowledgeItem.user_id == user.id)
    if category:
        stmt = stmt.where(KnowledgeItem.category == category)
    if favorite is not None:
        stmt = stmt.where(KnowledgeItem.favorite == favorite)
    rows = list(db.scalars(stmt.order_by(KnowledgeItem.created_at.desc())).all())
    if q:
        ql = q.lower()
        rows = [
            r
            for r in rows
            if ql in (r.title or "").lower() or ql in (r.content or "").lower() or ql in (r.tags or "").lower()
        ]
    return [_serialize(r) for r in rows]


def add_item(
    user: User,
    db,
    title: str,
    content: str,
    source: str = "upload",
    category: str = "general",
    tags: list[str] | None = None,
    source_ref: str = "",
) -> dict:
    source = source if source in ALLOWED_SOURCES else "upload"
    k = KnowledgeItem(
        user_id=user.id,
        title=title[:200],
        content=content,
        source=source,
        source_ref=source_ref,
        category=category[:40] or "general",
        tags=json.dumps(tags or [], ensure_ascii=False),
    )
    db.add(k)
    db.commit()
    return _serialize(k)


def update_item(user: User, db, item_id: str, **fields) -> dict | None:
    k = db.scalar(select(KnowledgeItem).where(KnowledgeItem.id == item_id, KnowledgeItem.user_id == user.id))
    if k is None:
        return None
    if "title" in fields:
        k.title = fields["title"][:200]
    if "content" in fields:
        k.content = fields["content"]
    if "category" in fields:
        k.category = fields["category"][:40] or "general"
    if "tags" in fields:
        k.tags = json.dumps(fields["tags"] or [], ensure_ascii=False)
    if "source" in fields and fields["source"] in ALLOWED_SOURCES:
        k.source = fields["source"]
    db.commit()
    return _serialize(k)


def toggle_favorite(user: User, db, item_id: str) -> dict | None:
    k = db.scalar(select(KnowledgeItem).where(KnowledgeItem.id == item_id, KnowledgeItem.user_id == user.id))
    if k is None:
        return None
    k.favorite = not k.favorite
    db.commit()
    return _serialize(k)


def remove_item(user: User, db, item_id: str) -> bool:
    k = db.scalar(select(KnowledgeItem).where(KnowledgeItem.id == item_id, KnowledgeItem.user_id == user.id))
    if k is None:
        return False
    db.delete(k)
    db.commit()
    return True
