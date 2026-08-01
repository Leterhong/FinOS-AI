"""前端 Node 侧历史数据编解码（Phase 7.0.2, 任务 #290）。

对齐前端 `src/financial-data/storage/crypto.ts` 与 `src/ai/model-center/encryption/index.ts`：

- 整文件信封 ``{alg, iv(base64,12B), tag(base64,16B), data(base64), savedAt?}``
- 密钥 = ``scryptSync(secret, salt, 32)``（Node 默认 N=16384, r=8, p=1）
- 金融/模型文件信封用 salt ``finos-financial-data-v1``
- ``encryptedApiKey`` 字段信封用 salt ``finos-model-center-v1``

Python 侧：``hashlib.scrypt`` + ``cryptography.AESGCM``（密文需要 ``data || tag`` 拼接）。
"""
from __future__ import annotations

import base64
import hashlib
import json
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# 与前端保持一致
FINANCIAL_SALT = "finos-financial-data-v1"
MODEL_CENTER_SALT = "finos-model-center-v1"
DEV_FALLBACK_SECRET = "finos-dev-only-secret-do-not-use-in-prod"

_SCRYPT_MAXMEM = 64 * 1024 * 1024


def derive_key(secret: str, salt: str) -> bytes:
    """用与 Node ``scryptSync`` 默认参数一致的参数派生 32 字节密钥。"""
    return hashlib.scrypt(
        secret.encode("utf-8"),
        salt=salt.encode("utf-8"),
        n=16384,
        r=8,
        p=1,
        dklen=32,
        maxmem=_SCRYPT_MAXMEM,
    )


def is_envelope(obj: Any) -> bool:
    """判断对象是否为 AES-256-GCM 信封。"""
    return (
        isinstance(obj, dict)
        and obj.get("alg") == "aes-256-gcm"
        and isinstance(obj.get("iv"), str)
        and isinstance(obj.get("tag"), str)
        and isinstance(obj.get("data"), str)
    )


def decrypt_envelope(envelope: dict, secret: str, salt: str, *, as_json: bool = True) -> Any:
    """解密信封。

    - ``as_json=True``（默认）：解出 JSON 对象（金融/模型整文件信封）。
    - ``as_json=False``：解出的明文直接作为字符串返回（如 API Key 信封）。
    """
    key = derive_key(secret, salt)
    iv = base64.b64decode(envelope["iv"])
    tag = base64.b64decode(envelope["tag"])
    data = base64.b64decode(envelope["data"])
    # Python 要求密文 || tag 拼接
    plaintext = AESGCM(key).decrypt(iv, data + tag, None)
    if as_json:
        return json.loads(plaintext.decode("utf-8"))
    return plaintext.decode("utf-8")


def encrypt_envelope_text(plain: str, secret: str, salt: str) -> dict:
    """加密纯文本（非 JSON）为信封，如 API Key（自测用）。"""
    key = derive_key(secret, salt)
    iv = b"0123456789ab"
    ct = AESGCM(key).encrypt(iv, plain.encode("utf-8"), None)
    return {
        "alg": "aes-256-gcm",
        "iv": base64.b64encode(iv).decode("ascii"),
        "tag": base64.b64encode(ct[-16:]).decode("ascii"),
        "data": base64.b64encode(ct[:-16]).decode("ascii"),
    }


def encrypt_envelope(plain: Any, secret: str, salt: str) -> dict:
    """加密对象为信封（自测 / 往返验证用，与前端结构一致）。"""
    key = derive_key(secret, salt)
    iv = b"0123456789ab"  # 固定 IV 仅用于自测可重复性；生产不可用
    ct = AESGCM(key).encrypt(iv, json.dumps(plain, ensure_ascii=False).encode("utf-8"), None)
    return {
        "alg": "aes-256-gcm",
        "iv": base64.b64encode(iv).decode("ascii"),
        "tag": base64.b64encode(ct[-16:]).decode("ascii"),
        "data": base64.b64encode(ct[:-16]).decode("ascii"),
        "savedAt": "2026-01-01T00:00:00.000Z",
    }


def parse_maybe_encrypted(text: str, secret: str, salt: str) -> Any:
    """解析文本：若为信封则解密，否则原样返回 JSON。"""
    obj = json.loads(text)
    if is_envelope(obj):
        return decrypt_envelope(obj, secret, salt)
    return obj
