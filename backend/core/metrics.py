"""请求耗时与错误率统计（Phase 7.0.4 五、API 性能优化）。

通过 MetricsMiddleware 记录每个接口：接口名称、响应时间(ms)、错误率。
数据存放在进程内统计表，可通过 snapshot() 读取，亦由 /api/metrics 暴露。
"""
from __future__ import annotations

import hmac
import re
import time
from collections import defaultdict
from threading import Lock

from starlette.middleware.base import BaseHTTPMiddleware

from fastapi import APIRouter, Request

from backend.core.logging_config import get_logger
from backend.core.response import fail, ok

logger = get_logger("finos.metrics")

router = APIRouter()

# 路径中的 ID 段（UUID / 十六进制 / 长数字）归一化为 :id，
# 防止逐资源路径把进程内统计表撑成无界内存。
_ID_SEGMENT = re.compile(r"^[0-9a-fA-F]{8,}|\d{4,}$")

_stats: dict[str, dict] = defaultdict(
    lambda: {"count": 0, "errors": 0, "total_ms": 0.0, "max_ms": 0.0}
)
_lock = Lock()
_MAX_ENDPOINTS = 500


def normalize_endpoint(path: str) -> str:
    parts = path.rstrip("/").split("/")
    return "/".join(":id" if (_ID_SEGMENT.match(p)) else p for p in parts)


def record(endpoint: str, ms: float, error: bool) -> None:
    with _lock:
        s = _stats.get(endpoint)
        if s is None:
            # 硬上限兜底：达到容量后丢弃新维度而不是无限增长。
            if len(_stats) >= _MAX_ENDPOINTS:
                return
            s = _stats[endpoint] = {"count": 0, "errors": 0, "total_ms": 0.0, "max_ms": 0.0}
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
            endpoint = f"{request.method} {normalize_endpoint(request.url.path)}"
            record(endpoint, ms, error)
            if error or ms > 1000:
                logger.warning(
                    "slow_or_error_request",
                    extra={"endpoint": endpoint, "ms": round(ms, 1), "error": error},
                )


def _authorized(request: Request) -> bool:
    """运行指标属于运维信息，仅允许持有 ``X-Metrics-Key``（值为 BACKUP_API_KEY）
    的采集器读取；普通登录用户（含访客）无权查看全局统计。

    BACKUP_API_KEY 未配置时端点关闭（fail-closed）。
    """
    from backend.config import get_settings

    expected = (get_settings().backup_api_key or "").strip()
    if not expected:
        return False
    provided = request.headers.get("x-metrics-key", "")
    return bool(provided) and hmac.compare_digest(provided, expected)


@router.get("/metrics")
def metrics(request: Request):
    """暴露累计接口耗时与错误率统计（只读，无 PII）。仅限运维 Key。"""
    if not _authorized(request):
        return fail("无权访问运行指标", status_code=403)
    return ok(snapshot())
