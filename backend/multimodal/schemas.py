"""多模态请求体（Pydantic v2，字段直接 camelCase）。"""
from __future__ import annotations

from pydantic import BaseModel, Field


class TextIngestRequest(BaseModel):
    text: str
    useAi: bool = True


class SpeechRequest(BaseModel):
    """语音：优先使用前端 Web Speech API 转写好的 transcript（零成本）。"""

    transcript: str = ""
    useAi: bool = True
    autoIngest: bool = True


class ConfirmRequest(BaseModel):
    ids: list[str]
    # { extractionId: {amount, label, assetType, kind} } —— 用户在确认页可微调
    edits: dict[str, dict] = Field(default_factory=dict)


class RejectRequest(BaseModel):
    ids: list[str]


class AssistantRequest(BaseModel):
    """统一助手入口：一句话 + 可选已识别实体，返回答案与建议动作。"""

    message: str
    sessionId: str | None = None
    useAi: bool = True
