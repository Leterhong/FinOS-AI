"""Phase 7.2 财富报告表（强制 user_id 隔离）。"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.database.base import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class WealthReport(Base):
    """生成的财富报告。content 存 Markdown，payload 存结构化数据快照。"""

    __tablename__ = "wealth_reports"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    kind: Mapped[str] = mapped_column(String(30), default="monthly", index=True)
    title: Mapped[str] = mapped_column(String(200), default="")
    period: Mapped[str] = mapped_column(String(40), default="")  # 2026-07 / 2026 / —
    tier: Mapped[str] = mapped_column(String(10), default="local")
    content: Mapped[str] = mapped_column(Text, default="")   # Markdown 正文
    payload: Mapped[str] = mapped_column(Text, default="{}")  # 结构化快照
    section_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (Index("ix_wealth_reports_user_created", "user_id", "created_at"),)
