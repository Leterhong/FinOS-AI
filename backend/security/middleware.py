"""安全中间件（Phase 7.6 需求十二）：

- 频率限制：登录/注册严格限流、AI 接口独立限流、其余接口通用限流
  （Redis 滑动窗口，多进程共享配额；不可用时降级进程内窗口）。
- CSRF：双提交 Cookie 模式，仅对「Cookie 认证 + 变更请求」校验，Bearer(SPA) 免校验。
- 安全响应头：CSP / X-Content-Type-Options / X-Frame-Options / Referrer-Policy 等。
"""
from __future__ import annotations

import hmac

from backend.core.cache import cache
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from backend.config import get_settings
from backend.security.audit import effective_client_ip

# 严格限流的认证端点（防暴力破解 / 撞库）
_STRICT_AUTH_PATHS = {"/api/auth/login", "/api/auth/register", "/api/auth/bootstrap"}
_STRICT_AUTH_LIMIT = 10  # 次 / 分钟 / IP

# CSRF 校验豁免（登录态尚未建立或使用 Refresh Token 的引导端点）
_CSRF_EXEMPT = {
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/refresh",
    "/api/auth/logout",
    "/api/auth/csrf",
}
_MUTATING = {"POST", "PUT", "PATCH", "DELETE"}
_CSRF_COOKIE = "finos_csrf"
_CSRF_HEADER = "x-csrf-token"

# API 严格 CSP（后端仅提供 JSON，不应加载任何资源）
_API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"


class SecurityMiddleware(BaseHTTPMiddleware):
    def _rate_key(self, ip: str, path: str) -> tuple[str, int]:
        settings = get_settings()
        if path in _STRICT_AUTH_PATHS:
            return f"auth:{ip}", _STRICT_AUTH_LIMIT
        if path.startswith("/api/ai/"):
            return f"ai:{ip}", settings.ai_rate_limit_per_minute
        return f"api:{ip}", settings.api_rate_limit_per_minute

    def _csrf_ok(self, request: Request) -> bool:
        path = request.url.path
        if request.method not in _MUTATING or not path.startswith("/api/"):
            return True
        if path in _CSRF_EXEMPT:
            return True
        # 使用 Authorization: Bearer 的 SPA 请求天然抗 CSRF（浏览器不会自动带 header）
        auth = request.headers.get("authorization", "")
        if auth.lower().startswith("bearer "):
            return True
        # 非 Cookie 认证（既无 Bearer 也无认证 Cookie）交由后续鉴权处理，不在此拦截
        if not request.cookies.get("finos_token"):
            return True
        # Cookie 认证的变更请求：双提交校验（常量时间比较，避免时序侧信道）
        cookie_token = request.cookies.get(_CSRF_COOKIE) or ""
        header_token = request.headers.get(_CSRF_HEADER) or ""
        return bool(cookie_token) and bool(header_token) and hmac.compare_digest(cookie_token, header_token)

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        ip = effective_client_ip(request)

        # --- 频率限制 ---
        # cache.hit：Redis 可用时为跨进程共享配额（修复多 worker 下限流阈值
        # 实际 ×2 的问题），不可用时自动降级为进程内滑动窗口（fail-open）。
        rate_key, limit = self._rate_key(ip, path)
        if not cache.hit(rate_key, limit):
            return JSONResponse(status_code=429, content={"success": False, "error": "请求过于频繁，请稍后重试"})

        # --- CSRF 校验 ---
        if not self._csrf_ok(request):
            return JSONResponse(status_code=403, content={"success": False, "error": "CSRF 校验失败"})

        response = await call_next(request)

        # --- 安全响应头 ---
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if path.startswith("/api/"):
            response.headers["Content-Security-Policy"] = _API_CSP
            response.headers["Cache-Control"] = "no-store"
        return response
