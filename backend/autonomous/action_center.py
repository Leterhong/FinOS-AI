# -*- coding: utf-8 -*-
"""
backend/autonomous/action_center.py — Phase 7.4 需求九：AI 行动执行系统（Action Center）。

AI 给出的每条建议都会落成一条「行动项」，用户可以：
    完成（done）      —— 记录完成时间与反馈
    忽略（dismissed） —— 记录忽略原因
    延期（deferred）  —— 顺延到指定天数后再出现

这些反馈会直接喂给偏好学习（需求十）：
  经常完成风险类 → 提高风险类建议优先级；
  经常忽略某类   → 降低该类打扰频率。
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.autonomous import notifications as notif_engine
from backend.autonomous.models import AutomationAction
from backend.user.models import User

STATUSES = ("pending", "done", "dismissed", "deferred")
STATUS_LABEL = {"pending": "待处理", "done": "已完成", "dismissed": "已忽略", "deferred": "已延期"}
_PRIORITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}


def serialize(a: AutomationAction) -> dict:
    return {
        "id": a.id,
        "title": a.title,
        "detail": a.detail,
        "category": a.category,
        "priority": a.priority,
        "status": a.status,
        "statusLabel": STATUS_LABEL.get(a.status, a.status),
        "feedback": a.feedback_dict(),
        "sourceId": a.source_id,
        "dueAt": a.due_at.isoformat() if a.due_at else None,
        "completedAt": a.completed_at.isoformat() if a.completed_at else None,
        "createdAt": a.created_at.isoformat() if a.created_at else None,
    }


def create(
    db: Session,
    user: User,
    *,
    title: str,
    detail: str = "",
    category: str = "wealth",
    priority: str = "medium",
    due_in_days: float | None = None,
    source_id: str | None = None,
) -> AutomationAction:
    due_at = None
    if due_in_days is not None:
        try:
            due_at = datetime.now(timezone.utc) + timedelta(days=float(due_in_days))
        except (TypeError, ValueError):
            due_at = None
    item = AutomationAction(
        user_id=user.id,
        title=title[:200],
        detail=detail,
        category=category,
        priority=notif_engine.normalize_priority(priority),
        due_at=due_at,
        source_id=source_id,
    )
    db.add(item)
    db.commit()
    return item


def list_actions(
    db: Session,
    user: User,
    *,
    status: str | None = None,
    limit: int = 100,
    include_future_deferred: bool = False,
) -> list[AutomationAction]:
    stmt = select(AutomationAction).where(AutomationAction.user_id == user.id)
    if status:
        stmt = stmt.where(AutomationAction.status == status)
    rows = list(db.scalars(stmt.order_by(AutomationAction.created_at.desc()).limit(limit)).all())

    now = datetime.now(timezone.utc)
    if not include_future_deferred:
        # 延期未到时间的条目不出现在待办视图
        def _visible(a: AutomationAction) -> bool:
            if a.status != "deferred" or a.due_at is None:
                return True
            due = a.due_at if a.due_at.tzinfo else a.due_at.replace(tzinfo=timezone.utc)
            return due <= now

        rows = [a for a in rows if _visible(a)]

    rows.sort(
        key=lambda a: (
            0 if a.status == "pending" else 1,
            _PRIORITY_RANK.get(a.priority, 3),
            -(a.created_at.timestamp() if a.created_at else 0),
        )
    )
    return rows


def _get_owned(db: Session, user: User, action_id: str) -> AutomationAction | None:
    return db.scalar(
        select(AutomationAction).where(
            AutomationAction.id == action_id, AutomationAction.user_id == user.id
        )
    )


def complete(db: Session, user: User, action_id: str, feedback: dict | None = None) -> AutomationAction | None:
    item = _get_owned(db, user, action_id)
    if item is None:
        return None
    item.status = "done"
    item.completed_at = datetime.now(timezone.utc)
    fb = item.feedback_dict()
    fb.update(feedback or {})
    fb["action"] = "done"
    item.set_feedback(fb)
    db.commit()
    _learn_async(db, user)
    return item


def dismiss(db: Session, user: User, action_id: str, reason: str = "") -> AutomationAction | None:
    item = _get_owned(db, user, action_id)
    if item is None:
        return None
    item.status = "dismissed"
    fb = item.feedback_dict()
    fb.update({"action": "dismissed", "reason": reason})
    item.set_feedback(fb)
    db.commit()
    _learn_async(db, user)
    return item


def defer(db: Session, user: User, action_id: str, days: float = 7) -> AutomationAction | None:
    item = _get_owned(db, user, action_id)
    if item is None:
        return None
    item.status = "deferred"
    try:
        item.due_at = datetime.now(timezone.utc) + timedelta(days=float(days))
    except (TypeError, ValueError):
        item.due_at = datetime.now(timezone.utc) + timedelta(days=7)
    fb = item.feedback_dict()
    fb.update({"action": "deferred", "days": days})
    item.set_feedback(fb)
    db.commit()
    _learn_async(db, user)
    return item


def reopen(db: Session, user: User, action_id: str) -> AutomationAction | None:
    item = _get_owned(db, user, action_id)
    if item is None:
        return None
    item.status = "pending"
    item.completed_at = None
    db.commit()
    return item


def delete(db: Session, user: User, action_id: str) -> bool:
    item = _get_owned(db, user, action_id)
    if item is None:
        return False
    db.delete(item)
    db.commit()
    return True


def stats(db: Session, user: User) -> dict:
    rows = list(db.scalars(select(AutomationAction).where(AutomationAction.user_id == user.id)).all())
    by_status = {s: 0 for s in STATUSES}
    by_priority = {p: 0 for p in ("critical", "high", "medium", "low")}
    for a in rows:
        by_status[a.status] = by_status.get(a.status, 0) + 1
        by_priority[a.priority] = by_priority.get(a.priority, 0) + 1
    decided = by_status["done"] + by_status["dismissed"] + by_status["deferred"]
    return {
        "total": len(rows),
        "byStatus": by_status,
        "byPriority": by_priority,
        "pending": by_status["pending"],
        "acceptanceRate": round(by_status["done"] / decided, 4) if decided else 0.0,
    }


def _learn_async(db: Session, user: User) -> None:
    """反馈即学习（同步执行，纯统计，开销极小）。失败静默。"""
    try:
        from backend.autonomous.agents import preference as preference_agent

        preference_agent.learn(db, user)
    except Exception:  # noqa: BLE001
        try:
            db.rollback()
        except Exception:  # noqa: BLE001
            pass
