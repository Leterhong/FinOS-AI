"""将既有明文敏感字段原地升级为 AES-256-GCM 密文。"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.document.models import Document
from backend.financial.models import Asset, FinancialProfile, Transaction


def encrypt_existing_sensitive_data(db: Session) -> int:
    """幂等触发 TypeDecorator 重写；已加密值不会重复加密。"""
    count = 0
    for model, fields in (
        (FinancialProfile, ("income", "expense")),
        (Asset, ("amount",)),
        (Transaction, ("amount",)),
        (Document, ("storage_path",)),
    ):
        for row in db.scalars(select(model)).all():
            for field in fields:
                value = getattr(row, field)
                setattr(row, field, value)
            count += 1
    db.commit()
    return count
