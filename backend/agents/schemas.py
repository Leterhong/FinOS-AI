"""Agent 生态请求体（Pydantic v2，字段直接 camelCase）。"""
from __future__ import annotations

from pydantic import BaseModel, Field


class AgentConfigRequest(BaseModel):
    enabled: bool | None = None
    priority: int | None = None
    focus: str | None = None
    settings: dict | None = None


class RunAgentRequest(BaseModel):
    question: str = ""
    useAi: bool = True


class RunWorkflowRequest(BaseModel):
    question: str = ""
    useAi: bool = True
    agents: list[str] | None = None
    persist: bool = True


class ToolCallRequest(BaseModel):
    tool: str
    params: dict = Field(default_factory=dict)
