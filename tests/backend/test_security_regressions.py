"""高风险安全边界的回归测试。"""
from __future__ import annotations

import asyncio

import pytest

from backend.core.uploads import UploadTooLarge, read_upload_limited
from backend.security.network import UnsafeOutboundUrl, validate_public_http_url


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "http://127.0.0.1/admin",
        "http://localhost:8000",
        "http://169.254.169.254/latest/meta-data",
        "http://user:pass@example.com/hook",
    ],
)
def test_webhook_rejects_unsafe_targets(url: str) -> None:
    with pytest.raises(UnsafeOutboundUrl):
        validate_public_http_url(url)


class _Upload:
    def __init__(self, parts: list[bytes]) -> None:
        self.parts = parts
        self.closed = False

    async def read(self, _size: int) -> bytes:
        return self.parts.pop(0) if self.parts else b""

    async def close(self) -> None:
        self.closed = True


def test_upload_stops_when_limit_is_exceeded() -> None:
    upload = _Upload([b"1234", b"5678"])
    with pytest.raises(UploadTooLarge):
        asyncio.run(read_upload_limited(upload, 6, chunk_size=4))  # type: ignore[arg-type]
    assert upload.closed is True
