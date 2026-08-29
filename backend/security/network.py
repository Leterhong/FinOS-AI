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
    return _validate_http_url(raw_url, allow_private=False, label="Webhook")


def validate_model_endpoint_url(raw_url: str, *, allow_private: bool) -> str:
    """校验用户自配的模型 Base URL。

    比公网校验宽松一档：自托管 Ollama / 内网 OpenAI 兼容服务是合法场景，
    可通过 allow_private=True 放行本机与内网段；但云元数据所在的
    链路本地段（169.254.0.0/16、fe80::/10）与未指定地址在任何模式下都禁止。
    """
    return _validate_http_url(raw_url, allow_private=allow_private, label="模型接口地址")


def _validate_http_url(raw_url: str, *, allow_private: bool, label: str) -> str:
    url = (raw_url or "").strip()
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise UnsafeOutboundUrl(f"{label}仅支持有效的 HTTP/HTTPS 地址")
    if parsed.username or parsed.password:
        raise UnsafeOutboundUrl(f"{label}地址不能包含用户名或密码")
    try:
        infos = socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80))
    except socket.gaierror as exc:
        raise UnsafeOutboundUrl(f"{label}域名无法解析") from exc
    addresses = {item[4][0].split("%", 1)[0] for item in infos}
    if not addresses:
        raise UnsafeOutboundUrl(f"{label}域名未解析到有效地址")
    for value in addresses:
        ip = ipaddress.ip_address(value)
        if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
            ip = ip.ipv4_mapped
        if ip.is_multicast or ip.is_reserved or ip.is_unspecified:
            raise UnsafeOutboundUrl(f"{label}不允许访问组播/保留地址")
        if not allow_private:
            if not ip.is_global:
                raise UnsafeOutboundUrl(f"{label}不允许访问本机、内网或保留地址")
        elif ip.is_link_local:
            # is_global 在 Python 3.11+ 对 169.254.169.254 判定随实现而异，这里显式封死。
            raise UnsafeOutboundUrl(f"{label}不允许访问链路本地/云元数据地址")
    return url


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001, ANN201
        return None


def open_public_url(request: urllib.request.Request, *, timeout: float = 10.0):
    """校验目标并禁用自动重定向，防止借重定向绕过地址检查。"""
    validate_public_http_url(request.full_url)
    return urllib.request.build_opener(_NoRedirect).open(request, timeout=timeout)
