"""环境变量驱动的加密密钥管理。"""
from __future__ import annotations

import base64
import hashlib

from backend.config import get_settings


class KeyManager:
    """提供 AES-256 主密钥；生产环境禁止使用缺省或派生密钥。"""

    @staticmethod
    def master_key() -> bytes:
        settings = get_settings()
        value = settings.encryption_master_key.strip()
        if not value:
            raise RuntimeError("ENCRYPTION_MASTER_KEY 未配置")
        try:
            decoded = base64.urlsafe_b64decode(value.encode("ascii"))
        except Exception as exc:
            raise RuntimeError("ENCRYPTION_MASTER_KEY 必须是 URL-safe Base64") from exc
        if len(decoded) != 32:
            raise RuntimeError("ENCRYPTION_MASTER_KEY 解码后必须为 32 字节")
        return decoded

    @staticmethod
    def derive(context: str) -> bytes:
        return hashlib.sha256(KeyManager.master_key() + context.encode("utf-8")).digest()
