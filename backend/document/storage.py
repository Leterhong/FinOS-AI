"""企业上传文件加密落盘（AES-256-GCM）。

- 新上传文件以密文（``aesgcm:v1:`` 前缀 + ``.enc`` 后缀）落盘，磁盘不留明文；
- 关联数据绑定 ``user_id``，防止把他人密文当自己的文件读取；
- 兼容历史明文文件：无 ``.enc`` 后缀时按原样读取，便于逐步迁移。
"""
from __future__ import annotations

import base64
import uuid
from pathlib import Path

from backend.config import UPLOAD_DIR
from backend.security.encryption import EncryptionService

_CONTEXT = "document-file"


def _user_root(user_id: str) -> Path:
    safe = "".join(ch for ch in user_id if ch.isalnum())[:32] or "unknown"
    root = (UPLOAD_DIR / safe)
    root.mkdir(parents=True, exist_ok=True)
    return root


def save_document(user_id: str, extension: str, content: bytes) -> str:
    """加密保存并返回绝对存储路径。"""
    target = _user_root(user_id) / f"{uuid.uuid4().hex}{extension}.enc"
    token = EncryptionService(_CONTEXT).encrypt(
        base64.b64encode(content).decode("ascii"), associated_data=user_id
    )
    target.write_text(token, encoding="utf-8")
    return str(target)


def load_document(user_id: str, storage_path: str) -> bytes | None:
    """读取并解密；路径不属于该用户或解密失败返回 None。"""
    if not storage_path:
        return None
    path = Path(storage_path)
    if not path.is_file():
        return None
    try:
        path.resolve().relative_to(_user_root(user_id).resolve())
    except ValueError:
        return None  # 越权访问
    if path.suffix == ".enc":
        try:
            plain = EncryptionService(_CONTEXT).decrypt(path.read_text(encoding="utf-8"), associated_data=user_id)
            return base64.b64decode(plain)
        except Exception:  # noqa: BLE001
            return None
    # 历史明文文件：直接读取，避免破坏既有数据。
    return path.read_bytes()


def delete_document_file(user_id: str, storage_path: str) -> None:
    if not storage_path:
        return
    path = Path(storage_path)
    try:
        if path.is_file() and _user_root(user_id).resolve() in path.resolve().parents:
            path.unlink()
    except OSError:
        pass
