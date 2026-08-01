"""AES-256-GCM 字段加密服务。"""
from __future__ import annotations

import base64
import json
import os
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from backend.security.key_manager import KeyManager

PREFIX = "aesgcm:v1:"


class EncryptionService:
    """使用独立主密钥对数据库敏感字段进行认证加密。"""

    def __init__(self, context: str = "database-field") -> None:
        self._cipher = AESGCM(KeyManager.derive(context))

    def encrypt(self, value: str, *, associated_data: str = "") -> str:
        if value.startswith(PREFIX):
            return value
        nonce = os.urandom(12)
        encrypted = self._cipher.encrypt(nonce, value.encode("utf-8"), associated_data.encode("utf-8"))
        payload = base64.urlsafe_b64encode(nonce + encrypted).decode("ascii")
        return PREFIX + payload

    def decrypt(self, value: str, *, associated_data: str = "") -> str:
        if not value.startswith(PREFIX):
            raise ValueError("不是 AES-256-GCM 密文")
        raw = base64.urlsafe_b64decode(value[len(PREFIX):].encode("ascii"))
        if len(raw) < 29:
            raise ValueError("密文格式无效")
        plain = self._cipher.decrypt(raw[:12], raw[12:], associated_data.encode("utf-8"))
        return plain.decode("utf-8")

    def encrypt_json(self, value: Any, *, associated_data: str = "") -> str:
        return self.encrypt(json.dumps(value, ensure_ascii=False, separators=(",", ":")), associated_data=associated_data)

    def decrypt_json(self, value: str, *, associated_data: str = "") -> Any:
        return json.loads(self.decrypt(value, associated_data=associated_data))

    @staticmethod
    def is_encrypted(value: object) -> bool:
        return isinstance(value, str) and value.startswith(PREFIX)
