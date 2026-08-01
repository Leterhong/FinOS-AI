"""SQLAlchemy 透明加密字段类型。"""
from __future__ import annotations

from typing import Any

from sqlalchemy.types import Text, TypeDecorator

from backend.security.encryption import EncryptionService


class EncryptedString(TypeDecorator[str]):
    impl = Text
    cache_ok = True

    def __init__(self, context: str, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.context = context

    def process_bind_param(self, value: str | None, dialect) -> str | None:
        if value is None:
            return None
        return EncryptionService(self.context).encrypt(str(value), associated_data=self.context)

    def process_result_value(self, value: object, dialect) -> str | None:
        if value is None:
            return None
        text = str(value)
        if not EncryptionService.is_encrypted(text):
            return text
        return EncryptionService(self.context).decrypt(text, associated_data=self.context)


class EncryptedFloat(TypeDecorator[float]):
    impl = Text
    cache_ok = True

    def __init__(self, context: str, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self.context = context

    def process_bind_param(self, value: float | None, dialect) -> str | None:
        if value is None:
            return None
        return EncryptionService(self.context).encrypt(repr(float(value)), associated_data=self.context)

    def process_result_value(self, value: object, dialect) -> float | None:
        if value is None:
            return None
        text = str(value)
        if EncryptionService.is_encrypted(text):
            text = EncryptionService(self.context).decrypt(text, associated_data=self.context)
        return float(text)
