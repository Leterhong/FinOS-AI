"""认证域模型：RefreshToken（Phase 7.6 需求四 — 刷新 Token 轮换与吊销）。

安全约束：
- 只存 Refresh Token 的 jti（JWT ID），不存 Token 本体，避免泄露即可重放。
- 轮换（rotation）：每次 /auth/refresh 吊销旧 jti、签发新 jti。
- 退出（/auth/logout）：吊销当前 jti，使 Refresh Token 立即失效。
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from backend.database.base import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    jti: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (Index("ix_refresh_user_revoked", "user_id", "revoked"),)
