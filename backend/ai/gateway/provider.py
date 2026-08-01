"""AI Gateway — LLM Provider 调用层（Phase 7.0.1 需求八）。

Frontend → Backend AI Gateway → 用户配置模型（解密 Key）→ LLM Provider。
OpenAI 兼容协议（/chat/completions、/embeddings），httpx 实现。
API Key 仅在本模块内存中短暂存在，绝不写日志、绝不返回前端。
"""
from __future__ import annotations

import json
from collections.abc import AsyncGenerator

import httpx

DEFAULT_TIMEOUT = 60.0


class GatewayError(Exception):
    pass


def _headers(api_key: str) -> dict:
    return {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}


async def generate(
    base_url: str, api_key: str, model: str, messages: list[dict],
    temperature: float = 0.7, max_tokens: int = 4096,
) -> dict:
    """非流式生成。返回 {content, tokens}。"""
    url = base_url.rstrip("/") + "/chat/completions"
    payload = {"model": model, "messages": messages, "temperature": temperature, "max_tokens": max_tokens}
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        resp = await client.post(url, headers=_headers(api_key), json=payload)
    if resp.status_code != 200:
        raise GatewayError(f"模型调用失败（HTTP {resp.status_code}）")
    data = resp.json()
    content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
    usage = data.get("usage") or {}
    tokens = int(usage.get("total_tokens", 0))
    input_tokens = int(usage.get("prompt_tokens", 0))
    output_tokens = int(usage.get("completion_tokens", 0))
    return {"content": content, "tokens": tokens, "input_tokens": input_tokens, "output_tokens": output_tokens}


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
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
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
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        resp = await client.post(url, headers=_headers(api_key), json=payload)
    if resp.status_code != 200:
        raise GatewayError(f"Embedding 调用失败（HTTP {resp.status_code}）")
    data = resp.json()
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
