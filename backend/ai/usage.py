"""统一的 AI 用量落库助手。

背景：此前只有 /api/ai/generate|stream|embed 会写 AIUsageLog，RAG、Agent、CFO、
多模态等直接调用网关的路径全部漏记，导致用量与成本统计严重偏低。
"""
from __future__ import annotations


def estimate_tokens(text: str) -> int:
    """粗略估算 token：中英文混合按约 2 字符/token。"""
    if not text:
        return 0
    return max(1, len(str(text)) // 2)


def log_usage(
    user_id: str,
    model: str,
    request_type: str,
    *,
    provider: str = "openai-compatible",
    prompt_text: str = "",
    completion_text: str = "",
    latency_ms: int = 0,
) -> None:
    """写入一条用量记录；失败不抛出，避免影响主流程。"""
    input_tokens = estimate_tokens(prompt_text)
    output_tokens = estimate_tokens(completion_text)
    try:
        from backend.ai.models import AIUsageLog
        from backend.database import SessionLocal

        with SessionLocal() as session:
            session.add(
                AIUsageLog(
                    user_id=user_id,
                    model=model,
                    provider=provider,
                    tokens=input_tokens + output_tokens,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    latency_ms=latency_ms,
                    request_type=request_type,
                )
            )
            session.commit()
    except Exception:  # noqa: BLE001
        pass
