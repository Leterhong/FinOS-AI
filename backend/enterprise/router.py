"""企业工作区 REST 接口。

设计要点：
  - 前端保持乐观更新（localStorage 即时生效），本接口承担服务端持久化与跨设备同步；
  - 所有资源一律绑定 user_id，跨用户访问返回统一 404（防枚举，复用 security.permission 语义）；
  - GET /enterprise/snapshot 一次性拉取全部对象（前端启动合并用）；
  - 写接口全部 upsert 语义（前端以 id 为准推送），保证幂等。
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
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
from backend.security.permission import require_owned_resource
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


# ---------------------------------------------------------------- 入参模型
class CaseIn(BaseModel):
    id: str = Field(min_length=1, max_length=_ID_LEN)
    company: str = Field(min_length=1, max_length=200)
    title: str = Field(default="", max_length=300)
    industry: str = Field(default="", max_length=120)
    amount: str = Field(default="", max_length=120)
    status: str = Field(default="研判中", max_length=40)
    risk: str = Field(default="medium", max_length=20)
    progress: float = Field(default=0.0, ge=0, le=100)
    owner: str = Field(default="", max_length=120)
    nextAction: str = Field(default="", max_length=300)
    updatedAt: str | None = None


class DocumentIn(BaseModel):
    id: str = Field(min_length=1, max_length=_ID_LEN)
    caseId: str = Field(default="", max_length=_ID_LEN)
    name: str = Field(min_length=1, max_length=300)
    kind: str = Field(default="企业资料", max_length=40)
    status: str = Field(default="解析中", max_length=40)
    facts: int = Field(default=0, ge=0)
    ruleHits: int = Field(default=0, ge=0)
    analysis: str | None = None
    model: str | None = Field(default=None, max_length=200)
    error: str | None = None


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


class RuleIn(BaseModel):
    id: str = Field(min_length=1, max_length=_ID_LEN)
    code: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=300)
    domain: str = Field(default="", max_length=120)
    version: str = Field(default="v1.0", max_length=40)
    coverage: str = Field(default="待测试", max_length=40)
    coverageRate: float = Field(default=0.0, ge=0, le=100)
    conditions: list | None = None


class TaskIn(BaseModel):
    id: str = Field(min_length=1, max_length=_ID_LEN)
    caseId: str = Field(default="", max_length=_ID_LEN)
    title: str = Field(min_length=1, max_length=300)
    caseName: str = Field(default="", max_length=300)
    assignee: str = Field(default="", max_length=120)
    due: str = Field(default="", max_length=40)
    priority: str = Field(default="medium", max_length=20)
    stage: str = Field(default="待处理", max_length=40)


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
        "id": c.id, "company": c.company, "title": c.title, "industry": c.industry,
        "amount": c.amount, "status": c.status, "risk": c.risk, "progress": c.progress,
        "owner": c.owner, "nextAction": c.next_action, "updatedAt": c.updated_at.isoformat(),
    }


def _document_out(d: EnterpriseDocument) -> dict:
    return {
        "id": d.id, "caseId": d.case_id, "name": d.name, "kind": d.kind,
        "status": d.status, "facts": d.facts, "ruleHits": d.rule_hits,
        "analysis": d.analysis, "model": d.model, "error": d.error,
        "updatedAt": d.updated_at.isoformat(),
    }


def _risk_out(r: EnterpriseRisk) -> dict:
    return {
        "id": r.id, "caseId": r.case_id, "company": r.company, "title": r.title,
        "level": r.level, "evidence": r.evidence, "rule": r.rule, "impact": r.impact,
        "status": r.status, "updatedAt": r.updated_at.isoformat(),
    }


def _rule_out(r: EnterpriseRule) -> dict:
    return {
        "id": r.id, "code": r.code, "name": r.name, "domain": r.domain,
        "version": r.version, "conditions": _conditions_from_json(r.conditions),
        "coverage": r.coverage, "coverageRate": r.coverage_rate,
        "updatedAt": r.updated_at.isoformat(),
    }


def _task_out(t: EnterpriseTask) -> dict:
    return {
        "id": t.id, "caseId": t.case_id, "title": t.title, "caseName": t.case_name, "assignee": t.assignee,
        "due": t.due, "priority": t.priority, "stage": t.stage,
        "updatedAt": t.updated_at.isoformat(),
    }


def _brief_out(b: EnterpriseBrief) -> dict:
    return {
        "id": b.id, "caseId": b.case_id, "title": b.title, "summary": b.summary, "topic": b.topic,
        "model": b.model, "updatedAt": b.updated_at.isoformat(),
    }


def _apply_case(row: EnterpriseCase, body: CaseIn) -> None:
    row.company = _clip(body.company, 200)
    row.title = _clip(body.title, 300)
    row.industry = _clip(body.industry, 120)
    row.amount = _clip(body.amount, 120)
    row.status = _clip(body.status, 40)
    row.risk = _clip(body.risk, 20)
    row.progress = float(body.progress)
    row.owner = _clip(body.owner, 120)
    row.next_action = _clip(body.nextAction, 300)


def _apply_document(row: EnterpriseDocument, body: DocumentIn) -> None:
    row.case_id = _id(body.caseId)
    row.name = _clip(body.name, 300)
    row.kind = _clip(body.kind, 40)
    row.status = _clip(body.status, 40)
    row.facts = int(body.facts)
    row.rule_hits = int(body.ruleHits)
    row.analysis = (body.analysis or None)
    row.model = (body.model or None)
    row.error = (body.error or None)


def _apply_risk(row: EnterpriseRisk, body: RiskIn) -> None:
    row.case_id = _id(body.caseId)
    row.company = _clip(body.company, 200)
    row.title = _clip(body.title, 300)
    row.level = _clip(body.level, 20)
    row.evidence = _clip(body.evidence, 4000)
    row.rule = _clip(body.rule, 300)
    row.impact = _clip(body.impact, 4000)
    row.status = _clip(body.status, 40)


def _apply_rule(row: EnterpriseRule, body: RuleIn) -> None:
    row.code = _clip(body.code, 120)
    row.name = _clip(body.name, 300)
    row.domain = _clip(body.domain, 120)
    row.version = _clip(body.version, 40)
    row.conditions = _conditions_to_json(body.conditions)
    row.coverage = _clip(body.coverage, 40)
    row.coverage_rate = float(body.coverageRate)


def _apply_task(row: EnterpriseTask, body: TaskIn) -> None:
    row.case_id = _id(body.caseId)
    row.title = _clip(body.title, 300)
    row.case_name = _clip(body.caseName, 300)
    row.assignee = _clip(body.assignee, 120)
    row.due = _clip(body.due, 40)
    row.priority = _clip(body.priority, 20)
    row.stage = _clip(body.stage, 40)


def _apply_brief(row: EnterpriseBrief, body: BriefIn) -> None:
    row.case_id = _id(body.caseId)
    row.title = _clip(body.title, 300)
    row.summary = _clip(body.summary, 20000)
    row.topic = _clip(body.topic, 300)
    row.model = (body.model or None)


# ---------------------------------------------------------------- 快照
@router.get("/snapshot")
def snapshot(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """一次性拉取当前用户全部企业对象（前端启动合并）。"""
    uid = user.id
    return ok({
        "cases": [_case_out(c) for c in db.scalars(select(EnterpriseCase).where(EnterpriseCase.user_id == uid)).all()],
        "documents": [_document_out(d) for d in db.scalars(select(EnterpriseDocument).where(EnterpriseDocument.user_id == uid)).all()],
        "risks": [_risk_out(r) for r in db.scalars(select(EnterpriseRisk).where(EnterpriseRisk.user_id == uid)).all()],
        "rules": [_rule_out(r) for r in db.scalars(select(EnterpriseRule).where(EnterpriseRule.user_id == uid)).all()],
        "tasks": [_task_out(t) for t in db.scalars(select(EnterpriseTask).where(EnterpriseTask.user_id == uid)).all()],
        "briefs": [_brief_out(b) for b in db.scalars(select(EnterpriseBrief).where(EnterpriseBrief.user_id == uid)).all()],
    })


# ---------------------------------------------------------------- Cases
@router.post("/cases")
def upsert_case(body: CaseIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(EnterpriseCase, body.id)
    if row is None:
        row = EnterpriseCase(id=body.id, user_id=user.id)
        db.add(row)
    elif row.user_id != user.id:
        return fail("项目不存在", status_code=404)
    _apply_case(row, body)
    db.commit()
    return ok(_case_out(row))


@router.delete("/cases/{case_id}")
def delete_case(case_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = require_owned_resource(db, EnterpriseCase, case_id, user.id)
    db.delete(row)
    db.commit()
    return ok({"deleted": True})


# ---------------------------------------------------------------- Documents
@router.post("/documents")
def upsert_document(body: DocumentIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(EnterpriseDocument, body.id)
    if row is None:
        row = EnterpriseDocument(id=body.id, user_id=user.id)
        db.add(row)
    elif row.user_id != user.id:
        return fail("资料不存在", status_code=404)
    _apply_document(row, body)
    db.commit()
    return ok(_document_out(row))


@router.delete("/documents/{document_id}")
def delete_document(document_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = require_owned_resource(db, EnterpriseDocument, document_id, user.id)
    db.delete(row)
    db.commit()
    return ok({"deleted": True})


# ---------------------------------------------------------------- Risks
@router.post("/risks")
def upsert_risk(body: RiskIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(EnterpriseRisk, body.id)
    if row is None:
        row = EnterpriseRisk(id=body.id, user_id=user.id)
        db.add(row)
    elif row.user_id != user.id:
        return fail("风险不存在", status_code=404)
    _apply_risk(row, body)
    db.commit()
    return ok(_risk_out(row))


@router.delete("/risks/{risk_id}")
def delete_risk(risk_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = require_owned_resource(db, EnterpriseRisk, risk_id, user.id)
    db.delete(row)
    db.commit()
    return ok({"deleted": True})


# ---------------------------------------------------------------- Rules
@router.post("/rules")
def upsert_rule(body: RuleIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(EnterpriseRule, body.id)
    if row is None:
        row = EnterpriseRule(id=body.id, user_id=user.id)
        db.add(row)
    elif row.user_id != user.id:
        return fail("规则不存在", status_code=404)
    _apply_rule(row, body)
    db.commit()
    return ok(_rule_out(row))


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = require_owned_resource(db, EnterpriseRule, rule_id, user.id)
    db.delete(row)
    db.commit()
    return ok({"deleted": True})


# ---------------------------------------------------------------- Tasks
@router.post("/tasks")
def upsert_task(body: TaskIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(EnterpriseTask, body.id)
    if row is None:
        row = EnterpriseTask(id=body.id, user_id=user.id)
        db.add(row)
    elif row.user_id != user.id:
        return fail("任务不存在", status_code=404)
    _apply_task(row, body)
    db.commit()
    return ok(_task_out(row))


@router.delete("/tasks/{task_id}")
def delete_task(task_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = require_owned_resource(db, EnterpriseTask, task_id, user.id)
    db.delete(row)
    db.commit()
    return ok({"deleted": True})


# ---------------------------------------------------------------- Briefs
@router.post("/briefs")
def upsert_brief(body: BriefIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(EnterpriseBrief, body.id)
    if row is None:
        row = EnterpriseBrief(id=body.id, user_id=user.id)
        db.add(row)
    elif row.user_id != user.id:
        return fail("底稿不存在", status_code=404)
    _apply_brief(row, body)
    db.commit()
    return ok(_brief_out(row))


@router.delete("/briefs/{brief_id}")
def delete_brief(brief_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    row = require_owned_resource(db, EnterpriseBrief, brief_id, user.id)
    db.delete(row)
    db.commit()
    return ok({"deleted": True})
