# -*- coding: utf-8 -*-
"""
AI Memory Center 服务（复用 Phase 7.1 长期记忆 2.0）。

分类映射（面向用户）：
- preference  → 基础信息 / 财富目标 / 行为习惯
- life_stage  → 基础信息
- decision    → 历史决策
- wealth_change → 财富变化
用户拥有最终控制权：可查看 / 修改 / 删除。
"""
from __future__ import annotations

import json

from sqlalchemy import select

from backend.intelligence.ltm.service import KIND_LABELS, delete_memory, recall, remember
from backend.intelligence.models import LongTermMemory
from backend.user.models import User

ALLOWED_KINDS = set(KIND_LABELS.keys())


def list_memories(user: User, db, kind: str | None = None) -> dict:
    if kind and kind in ALLOWED_KINDS:
        groups = {kind: recall(db, user, kinds=(kind,), limit=50, mark_hit=False)}
    else:
        groups = {}
        for k in KIND_LABELS:
            items = recall(db, user, kinds=(k,), limit=50, mark_hit=False)
            if items:
                groups[k] = items
    return {"hasData": bool(groups), "groups": groups, "labels": KIND_LABELS}


def add_memory(
    user: User, db, kind: str, key: str, content: str, payload: dict | None = None, importance: float = 0.5
) -> dict:
    if kind not in ALLOWED_KINDS:
        raise ValueError("非法的记忆分类")
    row = remember(db, user, kind, key, content, payload=payload, importance=importance)
    return {
        "id": row.id,
        "kind": row.kind,
        "key": row.key,
        "content": row.content,
        "importance": row.importance,
    }


def update_memory(user: User, db, memory_id: str, content: str, payload: dict | None = None) -> dict | None:
    row = db.scalar(
        select(LongTermMemory).where(LongTermMemory.id == memory_id, LongTermMemory.user_id == user.id)
    )
    if row is None:
        return None
    row.content = content
    if payload is not None:
        row.payload = json.dumps(payload, ensure_ascii=False, default=str)
    db.commit()
    return {"id": row.id, "kind": row.kind, "content": row.content}


def remove_memory(user: User, db, memory_id: str) -> bool:
    return delete_memory(db, user, memory_id)
