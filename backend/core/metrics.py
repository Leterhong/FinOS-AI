"""请求耗时与错误率统计（Phase 7.0.4 五、API 性能优化）。

通过 MetricsMiddleware 记录每个接口：接口名称、响应时间(ms)、错误率。
数据存放在进程内统计表，可通过 snapshot() 读取，亦由 /api/metrics 暴露。
"""
from __future__ import annotations

import hmac
import time
from collections import defaultdict
from threading import Lock

from starlette.middleware.base import BaseHTTPMiddleware

from fastapi import APIRouter, Request

from backend.core.logging_config import get_logger
from backend.core.response import fail, ok

logger = get_logger("finos.metrics")

router = APIRouter()

_stats: dict[str, dict] = defaultdict(
    lambda: {"count": 0, "errors": 0, "total_ms": 0.0, "max_ms": 0.0}
)
_lock = Lock()


def record(endpoint: str, ms: float, error: bool) -> None:
    with _lock:
        s = _stats[endpoint]
        s["count"] += 1
        s["total_ms"] += ms
        if ms > s["max_ms"]:
            s["max_ms"] = ms
        if error:
            s["errors"] += 1


def snapshot() -> dict:
    with _lock:
        out: dict[str, dict] = {}
        for ep, s in _stats.items():
            avg = (s["total_ms"] / s["count"]) if s["count"] else 0.0
            out[ep] = {
                "count": s["count"],
                "errors": s["errors"],
                "error_rate": round(s["errors"] / s["count"], 4) if s["count"] else 0.0,
                "avg_ms": round(avg, 2),
                "max_ms": round(s["max_ms"], 2),
            }
        return out


class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        start = time.perf_counter()
        error = False
        try:
            response = await call_next(request)
            if response.status_code >= 500:
                error = True
            return response
        except Exception:
            error = True
            raise
        finally:
            ms = (time.perf_counter() - start) * 1000
            endpoint = f"{request.method} {request.url.path}"
            record(endpoint, ms, error)
            if error or ms > 1000:
                logger.warning(
                    "slow_or_error_request",
                    extra={"endpoint": endpoint, "ms": round(ms, 1), "error": error},
                )


def _authorized(request: Request) -> bool:
    """运行指标属于运维信息，不对匿名公众开放。

    两种放行方式：
    1. 采集器携带 ``X-Metrics-Key``（值为 BACKUP_API_KEY），供 Prometheus 等使用；
    2. 已登录用户携带有效的 Bearer Access Token。
    """
    from backend.config import get_settings
    from backend.core.security import decode_access_token

    expected = (get_settings().backup_api_key or "").strip()
    provided = request.headers.get("x-metrics-key", "")
    if expected and provided and hmac.compare_digest(provided, expected):
        return True

    authz = request.headers.get("authorization", "")
    if authz.lower().startswith("bearer "):
        return decode_access_token(authz[7:].strip()) is not None
    return False


@router.get("/metrics")
def metrics(request: Request):
    """暴露累计接口耗时与错误率统计（只读，无 PII）。需运维 Key 或已登录。"""
    if not _authorized(request):
        return fail("无权访问运行指标", status_code=403)
    return ok(snapshot())
