"""安全审计写入服务。"""
from __future__ import annotations

from fastapi import Request
from sqlalchemy.orm import Session

from backend.config import get_settings
from backend.security.models import AuditLog, SecurityEvent


def effective_client_ip(request: Request | None) -> str:
    """取请求来源 IP。

    X-Forwarded-For 仅在直接连接来源位于 TRUSTED_PROXY_IPS 时才信任，
    否则一律取 TCP 对端地址——审计与限流使用同一套判定，避免头伪造绕过。
    """
    if request is None:
        return "internal"
    peer = request.client.host if request.client else "unknown"
    forwarded = request.headers.get("x-forwarded-for", "").split(",", 1)[0].strip()
    if forwarded and peer in get_settings().trusted_proxy_ip_set:
        return forwarded
    return peer


# 兼容旧调用名。
client_ip = effective_client_ip


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
