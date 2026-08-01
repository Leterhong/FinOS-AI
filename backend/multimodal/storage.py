"""多模态文件加密落盘（Phase 7.2 需求十八：绑定 user_id + 加密存储）。

- 路径：backend/data/uploads/multimodal/{user_id}/{input_id}{ext}
- 内容：AES-256-GCM 加密后写入（复用 backend.security.encryption），磁盘上不存明文。
- 读取必须传 user_id，路径不匹配直接拒绝（防越权读取他人文件）。
"""
from __future__ import annotations

import base64
import hashlib
import os
from pathlib import Path

from backend.security.encryption import EncryptionService

_CONTEXT = "multimodal-file"
_ROOT = Path(__file__).resolve().parents[1] / "data" / "uploads" / "multimodal"


def content_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _user_dir(user_id: str) -> Path:
    safe = "".join(c for c in user_id if c.isalnum())[:32] or "unknown"
    d = _ROOT / safe
    d.mkdir(parents=True, exist_ok=True)
    return d


def save_encrypted(user_id: str, input_id: str, filename: str, data: bytes) -> str:
    """加密保存并返回相对存储路径。"""
    ext = os.path.splitext(filename or "")[1][:10]
    target = _user_dir(user_id) / f"{input_id}{ext}.enc"
    payload = EncryptionService(_CONTEXT).encrypt(
        base64.b64encode(data).decode("ascii"), associated_data=user_id
    )
    target.write_text(payload, encoding="utf-8")
    return str(target.relative_to(_ROOT.parents[2]))


def load_decrypted(user_id: str, storage_path: str) -> bytes | None:
    """解密读取。路径不属于该用户时返回 None（权限验证）。"""
    if not storage_path:
        return None
    full = (_ROOT.parents[2] / storage_path).resolve()
    try:
        full.relative_to(_user_dir(user_id).resolve())
    except ValueError:
        return None  # 越权访问
    if not full.is_file():
        return None
    try:
        plain = EncryptionService(_CONTEXT).decrypt(
            full.read_text(encoding="utf-8"), associated_data=user_id
        )
        return base64.b64decode(plain)
    except Exception:  # noqa: BLE001
        return None


def delete_file(user_id: str, storage_path: str) -> bool:
    if not storage_path:
        return False
    full = (_ROOT.parents[2] / storage_path).resolve()
    try:
        full.relative_to(_user_dir(user_id).resolve())
    except ValueError:
        return False
    try:
        full.unlink(missing_ok=True)
        return True
    except OSError:
        return False
