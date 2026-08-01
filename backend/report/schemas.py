"""报告请求体（Pydantic v2，字段直接 camelCase）。"""
from __future__ import annotations

from pydantic import BaseModel


class GenerateReportRequest(BaseModel):
    kind: str = "monthly"   # monthly / annual / life_plan / investment
    useAi: bool = True
    persist: bool = True
