"""出站网络访问安全边界。"""
from __future__ import annotations

import ipaddress
import socket
import urllib.request
from urllib.parse import urlparse


class UnsafeOutboundUrl(ValueError):
    pass


def validate_public_http_url(raw_url: str) -> str:
    """仅允许解析到公网地址的 HTTP(S) URL。"""
    url = (raw_url or "").strip()
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise UnsafeOutboundUrl("Webhook 仅支持有效的 HTTP/HTTPS 地址")
    if parsed.username or parsed.password:
        raise UnsafeOutboundUrl("Webhook 地址不能包含用户名或密码")
    try:
        infos = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80))
    except socket.gaierror as exc:
        raise UnsafeOutboundUrl("Webhook 域名无法解析") from exc
    addresses = {item[4][0].split("%", 1)[0] for item in infos}
    if not addresses:
        raise UnsafeOutboundUrl("Webhook 域名未解析到有效地址")
    if any(not ipaddress.ip_address(value).is_global for value in addresses):
        raise UnsafeOutboundUrl("Webhook 不允许访问本机、内网或保留地址")
    return url


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001, ANN201
        return None


def open_public_url(request: urllib.request.Request, *, timeout: float = 10.0):
    """校验目标并禁用自动重定向，防止借重定向绕过地址检查。"""
    validate_public_http_url(request.full_url)
    return urllib.request.build_opener(_NoRedirect).open(request, timeout=timeout)
