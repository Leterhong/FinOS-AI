"""企业工作区 REST 接口。

设计要点：
  - 前端保持乐观更新（localStorage 即时生效），本接口承担服务端持久化与跨设备同步；
  - 所有资源一律绑定 user_id，跨用户访问返回统一 404（防枚举，复用 security.permission 语义）；
  - GET /enterprise/snapshot 一次性拉取全部对象（前端启动合并用）；
  - 写接口全部 upsert 语义（前端以 id 为准推送），保证幂等。
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from backend.core import get_current_user, ok
from backend.core.response import fail
from backend.database import get_db
from backend.enterprise.models import (
    EnterpriseBrief,
    EnterpriseCase,
    EnterpriseDocument,
    EnterpriseRisk,
    EnterpriseRule,
    EnterpriseTask,
)
from backend.governance.service import (
    accessible_cases,
    can_access_case,
    ensure_default_organization,
    memberships_for_user,
    record_governance_audit,
    record_rule_revision,
    rule_accessible,
)
from backend.user.models import User

router = APIRouter(prefix="/enterprise", tags=["enterprise"])

_ID_LEN = 64


def _id(value: object) -> str:
    return str(value or "")[:_ID_LEN]


def _clip(value: object, limit: int) -> str:
    return str(value or "")[:limit]


def _conditions_to_json(conditions: object) -> str | None:
    if not isinstance(conditions, list):
        return None
    cleaned = []
    for item in conditions:
        if not isinstance(item, dict):
            continue
        metric = _clip(item.get("metric"), 120)
        value = item.get("value")
        op = item.get("op")
        if not metric or not isinstance(value, (int, float)) or op not in {"lt", "lte", "gt", "gte", "eq"}:
            continue
        cleaned.append({"metric": metric, "op": op, "value": float(value)})
    return json.dumps(cleaned, ensure_ascii=False) if cleaned else None


def _conditions_from_json(raw: str | None) -> list:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def _json_list(raw: str | None) -> list:
    if not raw:
        return []
    try:
        value = json.loads(raw)
        return value if isinstance(value, list) else []
    except json.JSONDecodeError:
        return []


def _json_dict(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        value = json.loads(raw)
        return value if isinstance(value, dict) else {}
    except json.JSONDecodeError:
        return {}


def _dump_json(value: object, limit: int) -> str | None:
    if value is None:
        return None
    encoded = json.dumps(value, ensure_ascii=False)
    if len(encoded) > limit:
        raise HTTPException(status_code=422, detail=f"结构化字段超过 {limit} 字符限制")
    return encoded


# ---------------------------------------------------------------- 入参模型
class CaseIn(BaseModel):
    id: str = Field(min_length=1, max_length=_ID_LEN)
    company: str = Field(min_length=1, max_length=200)
    organizationId: str | None = Field(default=None, max_length=32)
    classification: str = Field(default="internal", pattern="^(public|internal|confidential|restricted)$")
    title: str = Field(default="", max_length=300)
    industry: str = Field(default="", max_length=120)
    amount: str = Field(default="", max_length=120)
    status: str = Field(default="研判中", max_length=40)
    risk: str = Field(default="medium", max_length=20)
    progress: float = Field(default=0.0, ge=0, le=100)
    owner: str = Field(default="", max_length=120)
    nextAction: str = Field(default="", max_length=300)
    updatedAt: str | None = None
    createdAt: str | None = None
    archivedAt: str | None = Field(default=None, max_length=40)


class DocumentIn(BaseModel):
    id: str = Field(min_length=1, max_length=_ID_LEN)
    caseId: str = Field(default="", max_length=_ID_LEN)
    classification: str = Field(default="internal", pattern="^(public|internal|confidential|restricted)$")
    name: str = Field(min_length=1, max_length=300)
    kind: str = Field(default="企业资料", max_length=40)
    status: str = Field(default="解析中", max_length=40)
    facts: int = Field(default=0, ge=0)
    ruleHits: int = Field(default=0, ge=0)
    analysis: str | None = None
    model: str | None = Field(default=None, max_length=200)
    error: str | None = None
    factItems: list | None = Field(default=None, max_length=1000)
    ruleOutcomes: list | None = Field(default=None, max_length=500)
    uncertainties: list | None = Field(default=None, max_length=200)
    extractionMethod: str | None = Field(default=None, max_length=30)
    ocrUsed: bool = False
    tables: list | None = Field(default=None, max_length=100)


class RiskIn(BaseModel):
    id: str = Field(min_length=1, max_length=_ID_LEN)
    caseId: str = Field(default="", max_length=_ID_LEN)
    company: str = Field(default="", max_length=200)
    title: str = Field(min_length=1, max_length=300)
    level: str = Field(default="medium", max_length=20)
    evidence: str = Field(default="", max_length=4000)
    rule: str = Field(default="", max_length=300)
    impact: str = Field(default="", max_length=4000)
    status: str = Field(default="待核验", max_length=40)
    origin: str | None = Field(default=None, max_length=40)
    factIds: list[str] | None = Field(default=None, max_length=1000)
    ruleCodes: list[str] | None = Field(default=None, max_length=500)
    sourceRunId: str | None = Field(default=None, max_length=_ID_LEN)
    verificationNote: str | None = Field(default=None, max_length=4000)
    verifiedBy: str | None = Field(default=None, max_length=120)
    verifiedAt: str | None = Field(default=None, max_length=40)
    mitigationNote: str | None = Field(default=None, max_length=4000)


class RuleIn(BaseModel):
    id: str = Field(min_length=1, max_length=_ID_LEN)
    code: str = Field(min_length=1, max_length=120)
    organizationId: str | None = Field(default=None, max_length=32)
    name: str = Field(min_length=1, max_length=300)
    domain: str = Field(default="", max_length=120)
    version: str = Field(default="v1.0", max_length=40)
    coverage: str = Field(default="待测试", max_length=40)
    coverageRate: float = Field(default=0.0, ge=0, le=100)
    conditions: list | None = Field(default=None, max_length=100)
    testRecords: list | None = Field(default=None, max_length=1000)


class TaskIn(BaseModel):
    id: str = Field(min_length=1, max_length=_ID_LEN)
    caseId: str = Field(default="", max_length=_ID_LEN)
    title: str = Field(min_length=1, max_length=300)
    caseName: str = Field(default="", max_length=300)
    assignee: str = Field(default="", max_length=120)
    due: str = Field(default="", max_length=40)
    priority: str = Field(default="medium", max_length=20)
    stage: str = Field(default="待处理", max_length=40)
    note: str | None = Field(default=None, max_length=4000)
    history: list | None = Field(default=None, max_length=2000)


class BriefIn(BaseModel):
    id: str = Field(min_length=1, max_length=_ID_LEN)
    caseId: str = Field(default="", max_length=_ID_LEN)
    title: str = Field(min_length=1, max_length=300)
    summary: str = Field(default="", max_length=20000)
    topic: str = Field(default="", max_length=300)
    model: str | None = Field(default=None, max_length=200)


# ---------------------------------------------------------------- 序列化
def _case_out(c: EnterpriseCase) -> dict:
    return {
        "id": c.id, "organizationId": c.organization_id, "classification": c.classification,
        "company": c.company, "title": c.title, "industry": c.industry,
        "amount": c.amount, "status": c.status, "risk": c.risk, "progress": c.progress,
        "owner": c.owner, "nextAction": c.next_action, "createdAt": c.created_at.isoformat(),
        "updatedAt": c.updated_at.isoformat(), "archivedAt": c.archived_at or None,
    }


def _document_out(d: EnterpriseDocument) -> dict:
    return {
        "id": d.id, "caseId": d.case_id, "classification": d.classification,
        "name": d.name, "kind": d.kind,
        "status": d.status, "facts": d.facts, "ruleHits": d.rule_hits,
        "analysis": d.analysis, "model": d.model, "error": d.error,
        **_json_dict(d.evidence_json),
        "updatedAt": d.updated_at.isoformat(),
    }


def _risk_out(r: EnterpriseRisk) -> dict:
    return {
        "id": r.id, "caseId": r.case_id, "company": r.company, "title": r.title,
        "level": r.level, "evidence": r.evidence, "rule": r.rule, "impact": r.impact,
        "status": r.status, **_json_dict(r.review_json), "updatedAt": r.updated_at.isoformat(),
    }


def _rule_out(r: EnterpriseRule) -> dict:
    return {
        "id": r.id, "organizationId": r.organization_id,
        "code": r.code, "name": r.name, "domain": r.domain,
        "version": r.version, "conditions": _conditions_from_json(r.conditions),
        "testRecords": _json_list(r.tests_json),
        "coverage": r.coverage, "coverageRate": r.coverage_rate,
        "updatedAt": r.updated_at.isoformat(),
    }


def _task_out(t: EnterpriseTask) -> dict:
    return {
        "id": t.id, "caseId": t.case_id, "title": t.title, "caseName": t.case_name, "assignee": t.assignee,
        "due": t.due, "priority": t.priority, "stage": t.stage, "note": t.note,
        "history": _json_list(t.history_json),
        "updatedAt": t.updated_at.isoformat(),
    }


def _brief_out(b: EnterpriseBrief) -> dict:
    return {
        "id": b.id, "caseId": b.case_id, "title": b.title, "summary": b.summary, "topic": b.topic,
        "model": b.model, "updatedAt": b.updated_at.isoformat(),
    }


def _apply_case(row: EnterpriseCase, body: CaseIn) -> None:
    row.company = _clip(body.company, 200)
    row.classification = body.classification
    row.title = _clip(body.title, 300)
    row.industry = _clip(body.industry, 120)
    row.amount = _clip(body.amount, 120)
    row.status = _clip(body.status, 40)
    row.risk = _clip(body.risk, 20)
    row.progress = float(body.progress)
    row.owner = _clip(body.owner, 120)
    row.next_action = _clip(body.nextAction, 300)
    row.archived_at = _clip(body.archivedAt, 40)


def _apply_document(row: EnterpriseDocument, body: DocumentIn) -> None:
    row.case_id = _id(body.caseId)
    row.classification = body.classification
    row.name = _clip(body.name, 300)
    row.kind = _clip(body.kind, 40)
    row.status = _clip(body.status, 40)
    row.facts = int(body.facts)
    row.rule_hits = int(body.ruleHits)
    row.analysis = (body.analysis or None)
    row.model = (body.model or None)
    row.error = (body.error or None)
    row.evidence_json = _dump_json({
        "factItems": body.factItems or [],
        "ruleOutcomes": body.ruleOutcomes or [],
        "uncertainties": body.uncertainties or [],
        "extractionMethod": body.extractionMethod,
        "ocrUsed": body.ocrUsed,
        "tables": body.tables or [],
    }, 200_000)


def _apply_risk(row: EnterpriseRisk, body: RiskIn) -> None:
    row.case_id = _id(body.caseId)
    row.company = _clip(body.company, 200)
    row.title = _clip(body.title, 300)
    row.level = _clip(body.level, 20)
    row.evidence = _clip(body.evidence, 4000)
    row.rule = _clip(body.rule, 300)
    row.impact = _clip(body.impact, 4000)
    row.status = _clip(body.status, 40)
    row.review_json = _dump_json({
        "origin": body.origin,
        "factIds": body.factIds or [],
        "ruleCodes": body.ruleCodes or [],
        "sourceRunId": body.sourceRunId,
        "verificationNote": body.verificationNote,
        "verifiedBy": body.verifiedBy,
        "verifiedAt": body.verifiedAt,
        "mitigationNote": body.mitigationNote,
    }, 30_000)


def _apply_rule(row: EnterpriseRule, body: RuleIn) -> None:
    row.code = _clip(body.code, 120)
    row.name = _clip(body.name, 300)
    row.domain = _clip(body.domain, 120)
    row.version = _clip(body.version, 40)
    row.conditions = _conditions_to_json(body.conditions)
    row.coverage = _clip(body.coverage, 40)
    row.coverage_rate = float(body.coverageRate)
    row.tests_json = _dump_json(body.testRecords or [], 100_000)


def _apply_task(row: EnterpriseTask, body: TaskIn) -> None:
    row.case_id = _id(body.caseId)
    row.title = _clip(body.title, 300)
    row.case_name = _clip(body.caseName, 300)
    row.assignee = _clip(body.assignee, 120)
    row.due = _clip(body.due, 40)
    row.priority = _clip(body.priority, 20)
    row.stage = _clip(body.stage, 40)
    row.note = _clip(body.note, 4000)
    row.history_json = _dump_json(body.history or [], 100_000)


def _apply_brief(row: EnterpriseBrief, body: BriefIn) -> None:
    row.case_id = _id(body.caseId)
    row.title = _clip(body.title, 300)
    row.summary = _clip(body.summary, 20000)
    row.topic = _clip(body.topic, 300)
    row.model = (body.model or None)


# ---------------------------------------------------------------- 快照
@router.get("/snapshot")
def snapshot(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """一次性拉取本人及组织授权可见的企业对象。"""
    ensure_default_organization(db, user)
    cases = accessible_cases(db, user)
    case_ids = [item.id for item in cases]
    org_ids = [item.organization_id for item in memberships_for_user(db, user)]
    documents = list(db.scalars(select(EnterpriseDocument).where(or_(EnterpriseDocument.user_id == user.id, EnterpriseDocument.case_id.in_(case_ids or [""])))))
    risks = list(db.scalars(select(EnterpriseRisk).where(or_(EnterpriseRisk.user_id == user.id, EnterpriseRisk.case_id.in_(case_ids or [""])))))
    rules = [item for item in db.scalars(select(EnterpriseRule).where(or_(EnterpriseRule.user_id == user.id, EnterpriseRule.organization_id.in_(org_ids or [""])))) if rule_accessible(db, user, item)]
    tasks = list(db.scalars(select(EnterpriseTask).where(or_(EnterpriseTask.user_id == user.id, EnterpriseTask.case_id.in_(case_ids or [""])))))
    briefs = list(db.scalars(select(EnterpriseBrief).where(or_(EnterpriseBrief.user_id == user.id, EnterpriseBrief.case_id.in_(case_ids or [""])))))
    db.commit()
    return ok({
        "cases": [_case_out(c) for c in cases],
        "documents": [_document_out(d) for d in documents],
        "risks": [_risk_out(r) for r in risks],
        "rules": [_rule_out(r) for r in rules],
        "tasks": [_task_out(t) for t in tasks],
        "briefs": [_brief_out(b) for b in briefs],
    })


# ---------------------------------------------------------------- Cases
@router.post("/cases")
def upsert_case(body: CaseIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    default_org = ensure_default_organization(db, user)
    row = db.get(EnterpriseCase, body.id)
    if row is None:
        organization_id = body.organizationId or default_org.id
        member = next((item for item in memberships_for_user(db, user) if item.organization_id == organization_id and item.role in {"owner", "admin", "analyst"}), None)
        if member is None:
            return fail("无权在该组织创建项目", status_code=403)
        row = EnterpriseCase(id=body.id, user_id=user.id, organization_id=organization_id)
        db.add(row)
        action = "case.create"
    elif not can_access_case(db, user, row, "editor"):
        return fail("项目不存在", status_code=404)
    else:
        action = "case.update"
    _apply_case(row, body)
    record_governance_audit(db, user=user, action=action, resource_type="case", resource_id=row.id, organization_id=row.organization_id, case_id=row.id, details={"classification": row.classification}, request=request)
    db.commit()
    return ok(_case_out(row))


@router.delete("/cases/{case_id}")
def delete_case(case_id: str, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(EnterpriseCase, case_id)
    if row is None or not can_access_case(db, user, row, "admin"):
        return fail("项目不存在", status_code=404)
    record_governance_audit(db, user=user, action="case.delete", resource_type="case", resource_id=row.id, organization_id=row.organization_id, case_id=row.id, request=request)
    db.delete(row)
    db.commit()
    return ok({"deleted": True})


# ---------------------------------------------------------------- Documents
@router.post("/documents")
def upsert_document(body: DocumentIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(EnterpriseDocument, body.id)
    case = db.get(EnterpriseCase, body.caseId) if body.caseId else None
    if body.caseId and (case is None or not can_access_case(db, user, case, "editor")):
        return fail("项目不存在", status_code=404)
    if row is None:
        row = EnterpriseDocument(id=body.id, user_id=user.id)
        db.add(row)
        action = "document.create"
    elif row.user_id != user.id and (case is None or not can_access_case(db, user, case, "editor")):
        return fail("资料不存在", status_code=404)
    else:
        action = "document.update"
    _apply_document(row, body)
    record_governance_audit(db, user=user, action=action, resource_type="document", resource_id=row.id, organization_id=case.organization_id if case else "", case_id=row.case_id, details={"classification": row.classification, "status": row.status}, request=request)
    db.commit()
    return ok(_document_out(row))


@router.delete("/documents/{document_id}")
def delete_document(document_id: str, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(EnterpriseDocument, document_id)
    case = db.get(EnterpriseCase, row.case_id) if row else None
    if row is None or (row.user_id != user.id and (case is None or not can_access_case(db, user, case, "editor"))):
        return fail("资料不存在", status_code=404)
    record_governance_audit(db, user=user, action="document.delete", resource_type="document", resource_id=row.id, organization_id=case.organization_id if case else "", case_id=row.case_id, request=request)
    db.delete(row)
    db.commit()
    return ok({"deleted": True})


# ---------------------------------------------------------------- Risks
@router.post("/risks")
def upsert_risk(body: RiskIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(EnterpriseRisk, body.id)
    case = db.get(EnterpriseCase, body.caseId) if body.caseId else None
    if body.caseId and (case is None or not can_access_case(db, user, case, "editor")):
        return fail("项目不存在", status_code=404)
    if row is None:
        row = EnterpriseRisk(id=body.id, user_id=user.id)
        db.add(row)
        action = "risk.create"
    elif row.user_id != user.id and (case is None or not can_access_case(db, user, case, "editor")):
        return fail("风险不存在", status_code=404)
    else:
        action = "risk.update"
    _apply_risk(row, body)
    record_governance_audit(db, user=user, action=action, resource_type="risk", resource_id=row.id, organization_id=case.organization_id if case else "", case_id=row.case_id, details={"status": row.status, "level": row.level}, request=request)
    db.commit()
    return ok(_risk_out(row))


@router.delete("/risks/{risk_id}")
def delete_risk(risk_id: str, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(EnterpriseRisk, risk_id)
    case = db.get(EnterpriseCase, row.case_id) if row else None
    if row is None or (row.user_id != user.id and (case is None or not can_access_case(db, user, case, "editor"))):
        return fail("风险不存在", status_code=404)
    record_governance_audit(db, user=user, action="risk.delete", resource_type="risk", resource_id=row.id, organization_id=case.organization_id if case else "", case_id=row.case_id, request=request)
    db.delete(row)
    db.commit()
    return ok({"deleted": True})


# ---------------------------------------------------------------- Rules
@router.post("/rules")
def upsert_rule(body: RuleIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    org = ensure_default_organization(db, user)
    row = db.get(EnterpriseRule, body.id)
    if row is None:
        row = EnterpriseRule(id=body.id, user_id=user.id, organization_id=body.organizationId or org.id)
        db.add(row)
        action = "rule.create"
    elif not rule_accessible(db, user, row, "analyst"):
        return fail("规则不存在", status_code=404)
    else:
        action = "rule.update"
    _apply_rule(row, body)
    db.flush()
    record_rule_revision(db, rule=row, user=user, reason="创建规则" if action == "rule.create" else "更新规则")
    record_governance_audit(db, user=user, action=action, resource_type="rule", resource_id=row.id, organization_id=row.organization_id, details={"version": row.version}, request=request)
    db.commit()
    return ok(_rule_out(row))


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: str, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(EnterpriseRule, rule_id)
    if row is None or not rule_accessible(db, user, row, "analyst"):
        return fail("规则不存在", status_code=404)
    record_governance_audit(db, user=user, action="rule.delete", resource_type="rule", resource_id=row.id, organization_id=row.organization_id, details={"version": row.version}, request=request)
    db.delete(row)
    db.commit()
    return ok({"deleted": True})


# ---------------------------------------------------------------- Tasks
@router.post("/tasks")
def upsert_task(body: TaskIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(EnterpriseTask, body.id)
    case = db.get(EnterpriseCase, body.caseId) if body.caseId else None
    if body.caseId and (case is None or not can_access_case(db, user, case, "editor")):
        return fail("项目不存在", status_code=404)
    if row is None:
        row = EnterpriseTask(id=body.id, user_id=user.id)
        db.add(row)
        action = "task.create"
    elif row.user_id != user.id and (case is None or not can_access_case(db, user, case, "editor")):
        return fail("任务不存在", status_code=404)
    else:
        action = "task.update"
    _apply_task(row, body)
    record_governance_audit(db, user=user, action=action, resource_type="task", resource_id=row.id, organization_id=case.organization_id if case else "", case_id=row.case_id, details={"stage": row.stage}, request=request)
    db.commit()
    return ok(_task_out(row))


@router.delete("/tasks/{task_id}")
def delete_task(task_id: str, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(EnterpriseTask, task_id)
    case = db.get(EnterpriseCase, row.case_id) if row else None
    if row is None or (row.user_id != user.id and (case is None or not can_access_case(db, user, case, "editor"))):
        return fail("任务不存在", status_code=404)
    record_governance_audit(db, user=user, action="task.delete", resource_type="task", resource_id=row.id, organization_id=case.organization_id if case else "", case_id=row.case_id, request=request)
    db.delete(row)
    db.commit()
    return ok({"deleted": True})


# ---------------------------------------------------------------- Briefs
@router.post("/briefs")
def upsert_brief(body: BriefIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(EnterpriseBrief, body.id)
    case = db.get(EnterpriseCase, body.caseId) if body.caseId else None
    if body.caseId and (case is None or not can_access_case(db, user, case, "editor")):
        return fail("项目不存在", status_code=404)
    if row is None:
        row = EnterpriseBrief(id=body.id, user_id=user.id)
        db.add(row)
        action = "brief.create"
    elif row.user_id != user.id and (case is None or not can_access_case(db, user, case, "editor")):
        return fail("底稿不存在", status_code=404)
    else:
        action = "brief.update"
    _apply_brief(row, body)
    record_governance_audit(db, user=user, action=action, resource_type="brief", resource_id=row.id, organization_id=case.organization_id if case else "", case_id=row.case_id, request=request)
    db.commit()
    return ok(_brief_out(row))


@router.delete("/briefs/{brief_id}")
def delete_brief(brief_id: str, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(EnterpriseBrief, brief_id)
    case = db.get(EnterpriseCase, row.case_id) if row else None
    if row is None or (row.user_id != user.id and (case is None or not can_access_case(db, user, case, "editor"))):
        return fail("底稿不存在", status_code=404)
    record_governance_audit(db, user=user, action="brief.delete", resource_type="brief", resource_id=row.id, organization_id=case.organization_id if case else "", case_id=row.case_id, request=request)
    db.delete(row)
    db.commit()
    return ok({"deleted": True})
