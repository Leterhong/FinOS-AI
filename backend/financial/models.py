"""财富数据模型：FinancialProfile / Asset / Transaction（Phase 7.0.1 需求四）。

所有表强制 user_id 外键 + 索引，实现用户数据隔离（需求六）。
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from backend.database.base import Base
from backend.security.types import EncryptedFloat


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class FinancialProfile(Base):
    __tablename__ = "financial_profiles"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    age: Mapped[int | None] = mapped_column(nullable=True)
    income: Mapped[float] = mapped_column(EncryptedFloat("financial-profile-income"), default=0.0)
    expense: Mapped[float] = mapped_column(EncryptedFloat("financial-profile-expense"), default=0.0)
    risk_level: Mapped[str] = mapped_column(String(20), default="balanced")  # conservative/balanced/aggressive
    goal: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (Index("ix_financial_profiles_user_created", "user_id", "created_at"),)


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    type: Mapped[str] = mapped_column(String(30), index=True, nullable=False)  # cash/stock/fund/bond/property/crypto/other
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    amount: Mapped[float] = mapped_column(EncryptedFloat("asset-amount"), default=0.0)  # AES-256-GCM 密文
    source: Mapped[str] = mapped_column(String(30), default="manual")  # manual/import/document
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (Index("ix_assets_user_created", "user_id", "created_at"),)


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    type: Mapped[str] = mapped_column(String(20), index=True, nullable=False)  # income/expense/transfer
    amount: Mapped[float] = mapped_column(EncryptedFloat("transaction-amount"), default=0.0)
    category: Mapped[str] = mapped_column(String(50), default="other")
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (Index("ix_transactions_user_date", "user_id", "date"),)
