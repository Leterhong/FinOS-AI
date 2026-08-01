"""系统健康检查（Phase 7.0.4 十五、系统健康检查）。

GET /api/health 返回：
  - database: ok / error
  - redis:    mode（redis / memory 降级）
  - ai_service: available / unavailable
  - uptime / version
"""
from __future__ import annotations

import time

from fastapi import APIRouter
from sqlalchemy import text

from backend.config import get_settings
from backend.core.cache import cache
from backend.core.logging_config import get_logger
from backend.database import SessionLocal

settings = get_settings()
logger = get_logger("finos.health")

_start_time = time.time()

router = APIRouter()


def _check_database() -> dict:
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        return {"status": "ok"}
    except Exception as exc:  # noqa: BLE001
        logger.error("database_health_failed", extra={"error": str(exc)})
        return {"status": "error", "detail": str(exc)}


def _check_ai() -> dict:
    try:
        from backend.ai.gateway import generate, stream  # 仅校验网关入口可导入

        if not callable(generate) or not callable(stream):
            return {"status": "unavailable", "detail": "gateway entrypoints not callable"}
        return {"status": "available"}
    except Exception as exc:  # noqa: BLE001
        return {"status": "unavailable", "detail": str(exc)}


@router.get("/health")
def health():
    db = _check_database()
    redis_mode = cache.mode
    ai = _check_ai()
    degraded = redis_mode != "redis"
    overall = "degraded" if (db["status"] != "ok" or degraded) else "ok"
    return {
        "success": True,
        "data": {
            "status": overall,
            "service": settings.app_name,
            "database": db,
            "redis": {"mode": redis_mode},
            "ai_service": ai,
            "uptime_seconds": int(time.time() - _start_time),
        },
        "message": "",
    }
