"""安全的上传读取工具。"""
from __future__ import annotations

from fastapi import UploadFile


class UploadTooLarge(ValueError):
    """上传内容超过允许大小。"""


async def read_upload_limited(file: UploadFile, max_bytes: int, *, chunk_size: int = 1024 * 1024) -> bytes:
    """分块读取上传文件，超过限制立即终止，避免一次性占满进程内存。"""
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            await file.close()
            raise UploadTooLarge(f"文件超过 {max_bytes // (1024 * 1024)}MB 上限")
        chunks.append(chunk)
    return b"".join(chunks)
