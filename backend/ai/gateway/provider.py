"""AI Gateway — LLM Provider 调用层（Phase 7.0.1 需求八）。

Frontend → Backend AI Gateway → 用户配置模型（解密 Key）→ LLM Provider。
OpenAI 兼容协议（/chat/completions、/embeddings），httpx 实现。
API Key 仅在本模块内存中短暂存在，绝不写日志、绝不返回前端。
"""
from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncGenerator

import httpx

from backend.security.network import UnsafeOutboundUrl, resolve_validated_ips

DEFAULT_TIMEOUT = 60.0


class GatewayError(Exception):
    pass


def _headers(api_key: str) -> dict:
    return {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}


class _PinnedTransport(httpx.AsyncHTTPTransport):
    """把连接固定到已校验的 IP，同时保留原主机名做 Host 头与 TLS SNI。

    这样校验与建连使用同一个 IP，关闭 DNS 重绑定（TOCTOU）窗口。
    """

    def __init__(self, hostname: str, ip: str) -> None:
        super().__init__()
        self._hostname = hostname
        self._ip = ip

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        if request.url.host == self._hostname:
            headers = [(k, v) for (k, v) in request.headers.raw if k.lower() != b"host"]
            pinned = httpx.Request(
                request.method,
                request.url.copy_with(host=self._ip),
                headers=headers,
                extensions={**request.extensions, "sni_hostname": self._hostname},
            )
            pinned.headers["host"] = self._hostname
            return await super().handle_async_request(pinned)
        return await super().handle_async_request(request)


def _client(base_url: str) -> httpx.AsyncClient:
    """构造出站客户端：先校验地址并固定 IP，再建连。"""
    from backend.config.settings import get_settings

    try:
        hostname, ips = resolve_validated_ips(
            base_url, allow_private=get_settings().ai_allow_private_endpoints
        )
    except UnsafeOutboundUrl as exc:
        raise GatewayError(str(exc)) from exc
    transport = _PinnedTransport(hostname, ips[0])
    return httpx.AsyncClient(timeout=DEFAULT_TIMEOUT, follow_redirects=False, transport=transport)


def _parse_completion(data: dict) -> dict:
    content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
    usage = data.get("usage") or {}
    tokens = int(usage.get("total_tokens", 0))
    input_tokens = int(usage.get("prompt_tokens", 0))
    output_tokens = int(usage.get("completion_tokens", 0))
    return {"content": content, "tokens": tokens, "input_tokens": input_tokens, "output_tokens": output_tokens}


async def generate(
    base_url: str, api_key: str, model: str, messages: list[dict],
    temperature: float = 0.7, max_tokens: int = 4096,
) -> dict:
    """非流式生成。返回 {content, tokens}。"""
    url = base_url.rstrip("/") + "/chat/completions"
    payload = {"model": model, "messages": messages, "temperature": temperature, "max_tokens": max_tokens}
    async with _client(base_url) as client:
        resp = await client.post(url, headers=_headers(api_key), json=payload)
    if resp.status_code != 200:
        raise GatewayError(f"模型调用失败（HTTP {resp.status_code}）")
    try:
        data = resp.json()
    except ValueError as exc:
        raise GatewayError("模型返回了非 JSON 响应") from exc
    return _parse_completion(data)


def generate_sync(
    base_url: str, api_key: str, model: str, messages: list[dict],
    temperature: float = 0.7, max_tokens: int = 4096,
) -> dict:
    """generate 的同步封装。

    供同步 def 路由 / 后台任务线程调用——直接调用 async generate 只会得到
    coroutine，下标取值必然 TypeError（Phase 7.0.2 遗留缺陷的根因）。
    调用方必须运行在没有事件循环的线程中（FastAPI 同步路由在线程池执行，满足）。
    """
    return asyncio.run(
        generate(base_url, api_key, model, messages, temperature=temperature, max_tokens=max_tokens)
    )


async def stream(
    base_url: str, api_key: str, model: str, messages: list[dict],
    temperature: float = 0.7, max_tokens: int = 4096,
) -> AsyncGenerator[str, None]:
    """流式生成，逐段 yield 文本增量。"""
    url = base_url.rstrip("/") + "/chat/completions"
    payload = {
        "model": model, "messages": messages,
        "temperature": temperature, "max_tokens": max_tokens, "stream": True,
    }
    async with _client(base_url) as client:
        async with client.stream("POST", url, headers=_headers(api_key), json=payload) as resp:
            if resp.status_code != 200:
                raise GatewayError(f"模型调用失败（HTTP {resp.status_code}）")
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                chunk = line.removeprefix("data:").strip()
                if chunk == "[DONE]":
                    break
                try:
                    delta = (json.loads(chunk).get("choices") or [{}])[0].get("delta", {})
                    text = delta.get("content")
                    if text:
                        yield text
                except json.JSONDecodeError:
                    continue


async def embed(base_url: str, api_key: str, model: str, texts: list[str]) -> dict:
    """向量化。返回 {embeddings, tokens}。"""
    url = base_url.rstrip("/") + "/embeddings"
    payload = {"model": model, "input": texts}
    async with _client(base_url) as client:
        resp = await client.post(url, headers=_headers(api_key), json=payload)
    if resp.status_code != 200:
        raise GatewayError(f"Embedding 调用失败（HTTP {resp.status_code}）")
    try:
        data = resp.json()
    except ValueError as exc:
        raise GatewayError("模型返回了非 JSON 响应") from exc
    embeddings = [item.get("embedding", []) for item in data.get("data", [])]
    usage = data.get("usage") or {}
    tokens = int(usage.get("total_tokens", 0))
    input_tokens = int(usage.get("prompt_tokens", tokens))
    return {"embeddings": embeddings, "tokens": tokens, "input_tokens": input_tokens, "output_tokens": 0}


async def test_connection(base_url: str, api_key: str, model: str) -> bool:
    """连通性探测：1 token 最小请求。"""
    try:
        await generate(base_url, api_key, model, [{"role": "user", "content": "ping"}], max_tokens=1)
        return True
    except Exception:
        return False
