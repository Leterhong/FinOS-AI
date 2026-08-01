"""安全原语：bcrypt 密码哈希、JWT 签发校验、Fernet API Key 加解密。

硬性约束（Phase 7.0.1 需求五/九）：
- 禁止明文保存密码 → bcrypt
- 禁止前端保存/看到完整 API Key → Fernet 加密入库，仅后端解密
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from cryptography.fernet import Fernet, InvalidToken

from backend.config import get_settings
from backend.security.encryption import EncryptionService

settings = get_settings()


# ---------- 密码 ----------
def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """验证 bcrypt；兼容迁移前的 Node scrypt 哈希。

    旧格式：
    - ``scrypt$<salt_hex>$<hash_hex>``（Phase 7.0.1 历史）
    - ``scrypt:v1:<salt_hex>:<hash_hex>``（前端 .data 迁移，任务 #290）
    首次登录成功后由认证路由升级为 bcrypt。
    """
    if hashed.startswith("scrypt:v1:"):
        try:
            payload = hashed[len("scrypt:v1:"):]
            salt_hex, digest_hex = payload.rsplit(":", 1)
            derived = hashlib.scrypt(
                plain.encode("utf-8"),
                salt=bytes.fromhex(salt_hex),
                n=16384,
                r=8,
                p=1,
                dklen=64,
            ).hex()
            return hmac.compare_digest(derived, digest_hex)
        except (ValueError, TypeError):
            return False
    if hashed.startswith("scrypt$"):
        try:
            _, salt_hex, digest_hex = hashed.split("$", 2)
            derived = hashlib.scrypt(
                plain.encode("utf-8"),
                salt=bytes.fromhex(salt_hex),
                n=16384,
                r=8,
                p=1,
                dklen=64,
            ).hex()
            return hmac.compare_digest(derived, digest_hex)
        except (ValueError, TypeError):
            return False
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def is_legacy_password_hash(hashed: str) -> bool:
    return hashed.startswith("scrypt$") or hashed.startswith("scrypt:v1:")


# ---------- JWT ----------
def create_access_token(user_id: str, email: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        return None
    # 拒绝把 Refresh Token 当作 Access Token 使用（type 混用防护）
    if payload.get("type") == "refresh":
        return None
    return payload


def create_refresh_token(user_id: str, email: str) -> tuple[str, str, datetime]:
    """签发 Refresh Token。

    返回 (token, jti, expires_at)；jti 入库用于轮换与吊销跟踪。
    """
    now = datetime.now(timezone.utc)
    jti = uuid.uuid4().hex
    expires_at = now + timedelta(days=settings.jwt_refresh_expire_days)
    payload = {
        "sub": user_id,
        "email": email,
        "type": "refresh",
        "jti": jti,
        "iat": now,
        "exp": expires_at,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, jti, expires_at


def decode_refresh_token(token: str) -> dict | None:
    """校验 Refresh Token（必须 type=refresh 且含 jti）。"""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != "refresh" or not payload.get("jti"):
        return None
    return payload


# ---------- API Key 加密（AES-256-GCM；兼容读取 Phase 7.0.1 Fernet 密文） ----------
def _legacy_fernet() -> Fernet:
    digest = hashlib.sha256(settings.jwt_secret.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(plain: str) -> str:
    return EncryptionService("api-key").encrypt(plain, associated_data="ai-model-config")


def decrypt_secret(cipher: str) -> str | None:
    try:
        if EncryptionService.is_encrypted(cipher):
            return EncryptionService("api-key").decrypt(cipher, associated_data="ai-model-config")
        return _legacy_fernet().decrypt(cipher.encode("utf-8")).decode("utf-8")
    except (InvalidToken, ValueError, RuntimeError):
        return None


def mask_key(plain_or_none: str | None) -> str:
    """前端只能看到掩码：sk-****last4。"""
    if not plain_or_none:
        return "****"
    tail = plain_or_none[-4:] if len(plain_or_none) >= 4 else "****"
    return f"****{tail}"
