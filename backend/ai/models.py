"""AI 域模型：AIUsageLog（需求四） + AIModelConfig（需求九：API Key 加密存储）。"""
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


class AIUsageLog(Base):
    """AI 调用用量与成本记录（Phase 7.6 需求七）。

    字段：user_id / model / provider / input_tokens / output_tokens / total_tokens(tokens)
    / latency_ms / request_type / created_at。
    """

    __tablename__ = "ai_usage_logs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    provider: Mapped[str] = mapped_column(String(50), default="openai-compatible")
    tokens: Mapped[int] = mapped_column(Integer, default=0)  # total_tokens
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    request_type: Mapped[str] = mapped_column(String(30), default="generate")  # generate/stream/embed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (Index("ix_ai_usage_user_created", "user_id", "created_at"),)


class AIConversation(Base):
    """AI 会话记录（Phase 7.6 需求二：ai_sessions 表）。

    多租户隔离：所有读写强制 user_id 过滤。conversation 存 JSON 序列化的消息数组。
    """

    __tablename__ = "ai_sessions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), default="新会话")
    model: Mapped[str] = mapped_column(String(100), default="")
    conversation: Mapped[str] = mapped_column(Text, default="[]")  # JSON: [{role, content}]
    tokens: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    __table_args__ = (Index("ix_ai_session_user_updated", "user_id", "updated_at"),)


class AIModelConfig(Base):
    """用户自定义模型配置。

    安全约束（需求九）：
    - api_key_encrypted 存 Fernet 密文，仅后端调用 LLM 时解密
    - 任何 API 响应只返回 名称/base_url/连接状态/掩码，绝不返回密文或明文 Key
    """

    __tablename__ = "ai_model_configs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)  # 展示名
    provider: Mapped[str] = mapped_column(String(50), default="openai-compatible")
    base_url: Mapped[str] = mapped_column(String(300), nullable=False)
    model_id: Mapped[str] = mapped_column(String(100), nullable=False)
    api_key_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    key_mask: Mapped[str] = mapped_column(String(20), default="****")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="unverified")  # unverified/connected/failed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
