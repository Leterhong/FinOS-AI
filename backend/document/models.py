"""Document 表（Phase 7.0.1 需求四/十）：文件绑定 user_id。"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from backend.database.base import Base
from backend.security.types import EncryptedString


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: uuid.uuid4().hex)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    filename: Mapped[str] = mapped_column(String(300), nullable=False)
    storage_path: Mapped[str] = mapped_column(EncryptedString("document-storage-path"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="uploaded")  # uploaded/processing/analyzed/failed
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True
    )

    __table_args__ = (Index("ix_documents_user_created", "user_id", "created_at"),)
