"""安全审计写入服务。"""
from __future__ import annotations

from fastapi import Request
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.security.models import AuditLog, SecurityEvent


def effective_client_ip(request: Request | None) -> str:
    """取请求来源 IP。

    仅当直连来源位于 TRUSTED_PROXY_IPS 时才解析 X-Forwarded-For，并从右往左
    取第一个「非可信代理」地址（真实客户端）。左侧可能由客户端伪造，绝不可信。
    审计与限流使用同一套判定，避免头伪造绕过。
    """
    if request is None:
        return "internal"
    peer = request.client.host if request.client else "unknown"
    trusted = get_settings().trusted_proxy_ip_set
    if peer not in trusted:
        return peer
    forwarded = [part.strip() for part in request.headers.get("x-forwarded-for", "").split(",") if part.strip()]
    for candidate in reversed(forwarded):
        if candidate not in trusted:
            return candidate
    return forwarded[0] if forwarded else peer


# 兼容旧调用名。
client_ip = effective_client_ip


def write_audit(db: Session, *, user_id: str | None, action: str, resource: str, request: Request | None = None) -> None:
    db.add(AuditLog(user_id=user_id, action=action, resource=resource, ip=client_ip(request)))


def purge_expired_audit_logs(db: Session, retention_days: int) -> dict:
    """按留存天数清理审计与安全事件（retention_days<=0 时不做任何事）。"""
    if retention_days <= 0:
        return {"audit": 0, "events": 0}
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import delete

    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    audit = db.execute(delete(AuditLog).where(AuditLog.created_at < cutoff)).rowcount
    events = db.execute(delete(SecurityEvent).where(SecurityEvent.created_at < cutoff)).rowcount
    db.commit()
    return {"audit": audit or 0, "events": events or 0}


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
