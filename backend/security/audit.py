"""安全审计写入服务。"""
from __future__ import annotations

from fastapi import Request
from sqlalchemy.orm import Session

from backend.security.models import AuditLog, SecurityEvent


def client_ip(request: Request | None) -> str:
    if request is None:
        return "internal"
    forwarded = request.headers.get("x-forwarded-for", "").split(",", 1)[0].strip()
    return forwarded or (request.client.host if request.client else "unknown")


def write_audit(db: Session, *, user_id: str | None, action: str, resource: str, request: Request | None = None) -> None:
    db.add(AuditLog(user_id=user_id, action=action, resource=resource, ip=client_ip(request)))


def write_security_event(
    db: Session,
    *,
    user_id: str | None,
    event_type: str,
    severity: str,
    details: str,
    request: Request | None = None,
) -> None:
    db.add(
        SecurityEvent(
            user_id=user_id,
            event_type=event_type,
            severity=severity,
            details=details[:1000],
            ip=client_ip(request),
        )
    )
