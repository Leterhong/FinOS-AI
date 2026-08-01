"""Phase 7.2 多模态数据表（强制 user_id 隔离 + 敏感字段加密）。

两张表：
- MultimodalInput   一次多模态输入（文本/图片/语音/文件）的元数据与识别文本
- ExtractionResult  从输入中提取出的结构化财富条目（默认 needs_confirm，用户确认才写 Twin）
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.database.base import Base
from backend.security.types import EncryptedString


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class MultimodalInput(Base):
    """一次多模态输入记录。

    modality: text / image / audio / document
    status:   received / processing / extracted / failed
    """

    __tablename__ = "multimodal_inputs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    modality: Mapped[str] = mapped_column(String(20), default="text", index=True)
    subtype: Mapped[str] = mapped_column(String(40), default="")  # stock_holding/bank_statement/...
    filename: Mapped[str] = mapped_column(String(300), default="")
    mime: Mapped[str] = mapped_column(String(120), default="")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    content_hash: Mapped[str] = mapped_column(String(64), default="", index=True)  # sha256，去重与缓存
    storage_path: Mapped[str | None] = mapped_column(
        EncryptedString("multimodal-storage-path"), nullable=True
    )
    raw_text: Mapped[str | None] = mapped_column(
        EncryptedString("multimodal-raw-text"), nullable=True
    )  # OCR / STT / 文档解析出的原始文本（敏感，加密存）
    summary: Mapped[str] = mapped_column(Text, default="")
    tier: Mapped[str] = mapped_column(String(10), default="local")  # local/ocr/ai
    status: Mapped[str] = mapped_column(String(20), default="received", index=True)
    error: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (
        Index("ix_multimodal_inputs_user_created", "user_id", "created_at"),
        Index("ix_multimodal_inputs_user_hash", "user_id", "content_hash"),
    )


class ExtractionResult(Base):
    """提取结果（Human-in-the-loop 铁律：默认 needs_confirm，绝不直接改 Twin）。"""

    __tablename__ = "multimodal_extractions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    input_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("multimodal_inputs.id"), index=True, nullable=False
    )
    kind: Mapped[str] = mapped_column(String(20), default="asset", index=True)
    label: Mapped[str] = mapped_column(String(200), default="")
    asset_type: Mapped[str] = mapped_column(String(30), default="other")
    amount: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(10), default="CNY")
    occurred_at: Mapped[str] = mapped_column(String(40), default="")  # 原文中的日期字符串
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    evidence: Mapped[str] = mapped_column(Text, default="")  # 命中的原文片段，供用户核对
    payload: Mapped[str] = mapped_column(Text, default="{}")
    status: Mapped[str] = mapped_column(String(20), default="needs_confirm", index=True)
    applied: Mapped[bool] = mapped_column(Boolean, default=False)
    applied_ref: Mapped[str] = mapped_column(String(32), default="")  # 写入后的 Asset/Transaction id
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (
        Index("ix_multimodal_extractions_user_created", "user_id", "created_at"),
        Index("ix_multimodal_extractions_user_status", "user_id", "status"),
    )
