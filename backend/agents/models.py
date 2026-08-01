"""Phase 7.2 Agent 生态数据表（强制 user_id 隔离）。

- UserAgentConfig  用户级 Agent 开关与关注领域（需求十二 Marketplace）
- AgentRunLog      Agent / 工作流执行记录（可观测 + 成本追踪）
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.database.base import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class UserAgentConfig(Base):
    __tablename__ = "user_agent_configs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    agent_name: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    priority: Mapped[int] = mapped_column(Integer, default=100)  # 越小越先执行
    focus: Mapped[str] = mapped_column(String(200), default="")  # 用户关注领域描述
    settings: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    __table_args__ = (
        Index("ix_user_agent_configs_user_created", "user_id", "created_at"),
        Index("ix_user_agent_configs_user_agent", "user_id", "agent_name"),
    )


class AgentRunLog(Base):
    __tablename__ = "agent_run_logs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    kind: Mapped[str] = mapped_column(String(20), default="agent", index=True)  # agent / workflow
    agent_name: Mapped[str] = mapped_column(String(50), default="", index=True)
    question: Mapped[str] = mapped_column(Text, default="")
    tier: Mapped[str] = mapped_column(String(10), default="local")
    ok: Mapped[bool] = mapped_column(Boolean, default=True)
    elapsed_ms: Mapped[int] = mapped_column(Integer, default=0)
    trace: Mapped[str] = mapped_column(Text, default="[]")
    result: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (Index("ix_agent_run_logs_user_created", "user_id", "created_at"),)
