"""Wealth Intelligence 请求体（Phase 7.1）。"""
from __future__ import annotations

from pydantic import BaseModel, Field


class PredictRequest(BaseModel):
    horizons: list[int] | None = None
    retirementAge: int = 60
    goalAmount: float | None = None
    goalYears: int | None = None
    refresh: bool = False


class SimulateRequest(BaseModel):
    eventType: str
    params: dict = Field(default_factory=dict)
    horizon: int = 10
    useAi: bool = True
    persist: bool = True


class PlanItem(BaseModel):
    key: str | None = None
    label: str | None = None
    events: list[dict] = Field(default_factory=list)


class CompareRequest(BaseModel):
    plans: list[PlanItem]
    horizon: int = 10


class WorkflowRequest(BaseModel):
    question: str = ""
    useAi: bool = True


class StrategyRequest(BaseModel):
    useAi: bool = True
    persist: bool = False


class MemoryWriteRequest(BaseModel):
    kind: str = "preference"
    key: str
    content: str
    payload: dict = Field(default_factory=dict)
    importance: float = 0.5


class ChatRequest(BaseModel):
    message: str
    sessionId: str | None = None
    useAi: bool = True
