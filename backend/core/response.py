"""统一 API 返回格式（Phase 7.0.1 需求十四）。

成功: { "success": true,  "data": {...}, "message": "" }
失败: { "success": false, "error": "..." }
"""
from __future__ import annotations

from typing import Any

from fastapi.responses import JSONResponse


def ok(data: Any = None, message: str = "") -> dict:
    return {"success": True, "data": data, "message": message}


def fail(error: str, status_code: int = 400) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"success": False, "error": error})
