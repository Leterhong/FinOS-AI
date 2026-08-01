"""Phase 7.0.2 业务服务数据表。

新增三张表（用户隔离，强制 user_id 索引）：
- FinancialTwin：Twin 快照历史（net_worth/cash_flow/risk_score/health_score/goal_progress/snapshot）
- AgentTask：Agent 编排任务（pending/running/completed/failed）
- KnowledgeChunk：RAG 知识切片（向量以 JSON 存库，余弦检索，用户隔离）
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from backend.database.base import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class FinancialTwin(Base):
    __tablename__ = "financial_twins"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    net_worth: Mapped[float] = mapped_column(Float, default=0.0)
    cash_flow: Mapped[float] = mapped_column(Float, default=0.0)  # 月度结余
    risk_score: Mapped[float] = mapped_column(Float, default=0.0)  # 风险暴露评分
    health_score: Mapped[int] = mapped_column(Integer, default=0)
    goal_progress: Mapped[float] = mapped_column(Float, default=0.0)  # 0-1
    snapshot: Mapped[str] = mapped_column(Text, default="{}")  # 完整 Twin JSON
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (Index("ix_financial_twins_user_created", "user_id", "created_at"),)


class AgentTask(Base):
    __tablename__ = "agent_tasks"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    task_type: Mapped[str] = mapped_column(String(40), default="general", index=True)  # general/cfo/monitor/rag/import
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)  # pending/running/completed/failed
    result: Mapped[str | None] = mapped_column(Text, nullable=True)  # 结果 JSON / 错误
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (Index("ix_agent_tasks_user_created", "user_id", "created_at"),)


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    document_id: Mapped[str | None] = mapped_column(String(32), index=True, nullable=True)
    category: Mapped[str] = mapped_column(String(30), default="general", index=True)
    title: Mapped[str] = mapped_column(String(200), default="")
    text: Mapped[str] = mapped_column(Text, default="")
    vector: Mapped[str] = mapped_column(Text, default="[]")  # JSON 向量（余弦检索）
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (Index("ix_knowledge_chunks_user_doc", "user_id", "document_id"),)
