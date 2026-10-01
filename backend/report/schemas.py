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


class RiskChecklistMeta(BaseModel):
    company: str = ""
    title: str = ""
    industry: str = ""
    amount: str = ""
    owner: str = ""
    status: str = ""
    risk: str = ""
    progress: float = 0
    classification: str | None = None
    createdAt: str | None = None


class RiskChecklistStats(BaseModel):
    total: int = 0
    byLevel: dict[str, int] = {}
    pending: int = 0
    confirmed: int = 0
    mitigated: int = 0
    documents: int = 0
    facts: int = 0


class RiskChecklistMetric(BaseModel):
    name: str = ""
    displayValue: str = ""
    category: str = ""
    interpretation: str = ""


class RiskChecklistTrend(BaseModel):
    topic: str = ""
    fromPeriod: str = ""
    toPeriod: str = ""
    changeRate: float = 0


class RiskChecklistGroup(BaseModel):
    project: str = "未关联项目"
    meta: RiskChecklistMeta | None = None
    stats: RiskChecklistStats | None = None
    financialMetrics: list[RiskChecklistMetric] = []
    financialTrends: list[RiskChecklistTrend] = []
    risks: list[RiskChecklistRisk] = []


class RiskChecklistRequest(BaseModel):
    generatedAt: str = ""
    groups: list[RiskChecklistGroup] = []
