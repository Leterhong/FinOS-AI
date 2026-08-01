"""安全审计、安全事件和账户数据删除 API。"""
from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from backend.ai.models import AIModelConfig, AIUsageLog
from backend.core import get_current_user, ok
from backend.core.response import fail
from backend.core.security import verify_password
from backend.database import get_db
from backend.document.models import Document
from backend.financial.models import Asset, FinancialProfile, Transaction
from backend.memory.models import Memory
from backend.notification.models import Notification
from backend.security.audit import write_audit
from backend.security.models import AuditLog, SecurityEvent
from backend.services.models import AgentTask, FinancialTwin, KnowledgeChunk
from backend.user.models import User

router = APIRouter(prefix="/security", tags=["security"])


class DeleteAccountIn(BaseModel):
    password: str = Field(min_length=1, max_length=128)
    confirmation: str


@router.get("/audit-logs")
def list_audit_logs(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(AuditLog).where(AuditLog.user_id == user.id).order_by(AuditLog.created_at.desc()).limit(200)
    ).all()
    return ok({"logs": [{"id": x.id, "action": x.action, "resource": x.resource, "ip": x.ip, "createdAt": x.created_at.isoformat()} for x in rows]})


@router.get("/events")
def list_security_events(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(SecurityEvent).where(SecurityEvent.user_id == user.id).order_by(SecurityEvent.created_at.desc()).limit(100)
    ).all()
    return ok({"events": [{"id": x.id, "type": x.event_type, "severity": x.severity, "details": x.details, "createdAt": x.created_at.isoformat()} for x in rows]})


@router.delete("/account")
def delete_account(
    body: DeleteAccountIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.confirmation != "DELETE MY DATA":
        return fail("请输入 DELETE MY DATA 确认删除")
    if not verify_password(body.password, user.password_hash):
        return fail("身份验证失败", status_code=401)

    documents = db.scalars(select(Document).where(Document.user_id == user.id)).all()
    for document in documents:
        try:
            path = Path(document.storage_path).resolve()
            if path.is_file():
                path.unlink()
        except OSError:
            pass

    for model in (
        KnowledgeChunk,
        AgentTask,
        FinancialTwin,
        Notification,
        Memory,
        Document,
        Transaction,
        Asset,
        FinancialProfile,
        AIUsageLog,
        AIModelConfig,
        SecurityEvent,
        AuditLog,
    ):
        db.execute(delete(model).where(model.user_id == user.id))
    db.delete(user)
    db.commit()
    return ok({"deleted": True}, "账户及关联数据已删除")
