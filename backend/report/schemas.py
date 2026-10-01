"""报告请求体（Pydantic v2，字段直接 camelCase）。"""
from __future__ import annotations

from pydantic import BaseModel


class GenerateReportRequest(BaseModel):
    kind: str = "monthly"   # monthly / annual / life_plan / investment
    useAi: bool = True
    persist: bool = True


class RiskChecklistRisk(BaseModel):
    title: str = ""
    level: str = "medium"
    status: str = ""
    company: str = ""
    evidence: str = ""
    evidenceQuotes: list[str] = []
    ruleRefs: str = ""
    ruleText: str = ""
    impact: str = ""
    factIds: list[str] = []
    ruleCodes: list[str] = []
    verifiedBy: str | None = None
    verifiedAt: str | None = None
    verificationNote: str | None = None


class RiskChecklistGroup(BaseModel):
    project: str = "未关联项目"
    risks: list[RiskChecklistRisk] = []


class RiskChecklistRequest(BaseModel):
    generatedAt: str = ""
    groups: list[RiskChecklistGroup] = []
