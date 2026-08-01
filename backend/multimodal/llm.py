"""多模态 LLM 调用助手（Phase 7.2 需求十五：成本控制 + 失败降级）。

复用 intelligence.reasoning.explain 的模型解析与「同步上下文安全调用 async gateway」范式，
额外支持 OpenAI 兼容的 vision 消息（content 数组 + image_url base64）。

铁律：任何异常一律静默降级，绝不阻断主流程，绝不把 raw prompt 暴露给用户。
"""
from __future__ import annotations

import asyncio

from sqlalchemy.orm import Session

from backend.ai.gateway import generate as gw_generate
from backend.intelligence.reasoning.explain import llm_available, resolve_model
from backend.user.models import User

__all__ = ["llm_available", "resolve_model", "run_llm", "vision_message"]


def _sync_generate(cfg, api_key: str, messages: list[dict], max_tokens: int, temperature: float) -> str:
    async def _call() -> dict:
        return await gw_generate(
            cfg.base_url, api_key, cfg.model_id, messages,
            temperature=temperature, max_tokens=max_tokens,
        )

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop is not None and loop.is_running():
        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(lambda: asyncio.run(_call())).result().get("content", "")
    return asyncio.run(_call()).get("content", "")


def run_llm(
    db: Session,
    user: User,
    messages: list[dict],
    *,
    max_tokens: int = 600,
    temperature: float = 0.3,
) -> str | None:
    """调用用户已配置的模型。未配置 / 调用失败一律返回 None（调用方负责降级）。"""
    resolved = resolve_model(db, user)
    if resolved is None:
        return None
    cfg, api_key = resolved
    try:
        content = _sync_generate(cfg, api_key, messages, max_tokens, temperature)
    except Exception:  # noqa: BLE001 — 任何异常都降级
        return None
    return (content or "").strip() or None


def vision_message(prompt: str, image_b64: str, mime: str = "image/png") -> list[dict]:
    """构造 OpenAI 兼容的 vision 请求消息。"""
    return [
        {
            "role": "system",
            "content": (
                "你是 FinOS AI 的财富票据识别助手。只允许读取图片中真实存在的文字与数字，"
                "严禁推测、严禁编造任何金额。无法辨认的内容一律留空。"
            ),
        },
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{image_b64}"}},
            ],
        },
    ]
