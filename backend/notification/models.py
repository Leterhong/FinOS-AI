"""Notification 表：通知服务（Phase 7.0.1 目录要求，按 user_id 隔离）。"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.database.base import Base


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: uuid.uuid4().hex)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    source: Mapped[str] = mapped_column(String(50), default="system")
    category: Mapped[str] = mapped_column(String(20), default="system", index=True)  # wealth/risk/goal/ai/system
    severity: Mapped[str] = mapped_column(String(20), default="info", index=True)  # 新分级 critical/high/medium/low；旧 info/warn 由 notifications.normalize_priority 兼容映射
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, default="")
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )

    __table_args__ = (Index("ix_notifications_user_created", "user_id", "created_at"),)
