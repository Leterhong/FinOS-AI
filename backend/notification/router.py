# -*- coding: utf-8 -*-
"""
通知服务：按 user_id 隔离的通知读取、已读、归档与主动创建（Phase 7.3 升级）。

分类 category：wealth（财富）/ risk（风险）/ goal（目标）/ ai（AI提醒）/ system（系统）
支持：已读 / 未读 / 归档。
"""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.core import get_current_user, ok
from backend.core.response import fail
from backend.database import get_db
from backend.notification.models import Notification
from backend.user.models import User

router = APIRouter(prefix="/notifications", tags=["notifications"])

ALLOWED_CATEGORIES = {"wealth", "risk", "goal", "ai", "system"}


class CreateNotification(BaseModel):
    title: str
    body: str = ""
    category: str = "system"
    severity: str = "info"
    source: str = "proactive"


def _serialize(n: Notification) -> dict:
    return {
        "id": n.id,
        "source": n.source,
        "category": n.category,
        "severity": n.severity,
        "title": n.title,
        "body": n.body,
        "read": n.read,
        "archived": n.archived,
        "createdAt": n.created_at.isoformat() if n.created_at else None,
    }


@router.get("")
def list_notifications(
    category: str | None = None,
    archived: bool | None = None,
    unread: bool | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    stmt = select(Notification).where(Notification.user_id == user.id)
    if category:
        stmt = stmt.where(Notification.category == category)
    if archived is not None:
        stmt = stmt.where(Notification.archived == archived)
    if unread is not None:
        stmt = stmt.where(Notification.read == (not unread))
    rows = list(db.scalars(stmt.order_by(Notification.created_at.desc()).limit(100)).all())
    return ok(
        {
            "notifications": [_serialize(n) for n in rows],
            "unread": sum(1 for n in rows if not n.read),
        }
    )


@router.post("")
def create_notification(body: CreateNotification, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cat = body.category if body.category in ALLOWED_CATEGORIES else "system"
    n = Notification(
        user_id=user.id,
        source=body.source,
        category=cat,
        severity=body.severity,
        title=body.title[:200],
        body=body.body,
    )
    db.add(n)
    db.commit()
    return ok(_serialize(n))


@router.post("/{notification_id}/read")
def mark_read(notification_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = db.scalar(select(Notification).where(Notification.id == notification_id, Notification.user_id == user.id))
    if n is None:
        return fail("通知不存在", status_code=404)
    n.read = True
    db.commit()
    return ok(None, "已标记已读")


@router.post("/{notification_id}/archive")
def toggle_archive(notification_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = db.scalar(select(Notification).where(Notification.id == notification_id, Notification.user_id == user.id))
    if n is None:
        return fail("通知不存在", status_code=404)
    n.archived = not n.archived
    db.commit()
    return ok(_serialize(n))


@router.delete("/{notification_id}")
def delete_notification(notification_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = db.scalar(select(Notification).where(Notification.id == notification_id, Notification.user_id == user.id))
    if n is None:
        return fail("通知不存在", status_code=404)
    db.delete(n)
    db.commit()
    return ok(None, "已删除")
