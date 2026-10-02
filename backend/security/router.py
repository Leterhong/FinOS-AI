"""安全审计、安全事件和账户数据删除 API。"""
from __future__ import annotations

import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from backend.agents.models import AgentRunLog, UserAgentConfig
from backend.ai.models import AIConversation, AIModelConfig, AIUsageLog
from backend.auth.models import RefreshToken
from backend.autonomous.models import (
    AutomationAction,
    AutomationEvent,
    AutomationMarketCache,
    AutomationPlan,
    AutomationPreference,
    AutomationRun,
    AutomationRule,
    AutomationScheduled,
    AutomationSnapshot,
    AutomationWebhook,
    AutomationWorkflow,
)
from backend.core import get_current_user, ok
from backend.core.cache import cache_invalidate_prefix
from backend.core.logging_config import get_logger, log_event
from backend.core.response import fail
from backend.core.security import verify_password
from backend.config import UPLOAD_DIR
from backend.database import get_db
from backend.database.base import Base
from backend.document.models import Document
from backend.enterprise.models import (
    EnterpriseBrief,
    EnterpriseCase,
    EnterpriseDocument,
    EnterpriseRisk,
    EnterpriseRule,
    EnterpriseTask,
)
from backend.financial.models import Asset, FinancialProfile, Transaction
from backend.governance.models import (
    EnterpriseConnector,
    GovernanceAudit,
    GovernanceReview,
    ModelEvalCase,
    ModelEvalRun,
    Organization,
    OrganizationMember,
    ProjectGrant,
    RuleRevision,
)
from backend.intelligence.models import (
    HealthScoreHistory,
    LongTermMemory,
    ScenarioSimulation,
    WealthPrediction,
    WealthStrategy,
)
from backend.memory.models import Memory
from backend.multimodal.models import ExtractionResult, MultimodalInput
from backend.notification.models import Notification
from backend.personal_os.models import (
    DailyBriefing,
    DecisionJournal,
    KnowledgeItem,
    PlanVersion,
    TimelineEvent,
    WealthAvatar,
)
from backend.report.models import WealthReport
from backend.security.audit import write_audit
from backend.security.models import AuditLog, SecurityEvent
from backend.services.models import AgentTask, FinancialTwin, KnowledgeChunk
from backend.tasks.models import AsyncTask
from backend.user.models import User

router = APIRouter(prefix="/security", tags=["security"])
logger = get_logger("finos.security")


class DeleteAccountIn(BaseModel):
    password: str = Field(min_length=1, max_length=128)
    confirmation: str


@router.get("/audit-logs")
def list_audit_logs(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(AuditLog).where(AuditLog.user_id == user.id).order_by(AuditLog.created_at.desc()).limit(200)
    ).all()
    return ok({"logs": [{"id": x.id, "action": x.action, "resource": x.resource, "ip": x.ip, "createdAt": x.created_at.isoformat()} for x in rows]})


@router.get("/events")
def list_security_events(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(SecurityEvent).where(SecurityEvent.user_id == user.id).order_by(SecurityEvent.created_at.desc()).limit(100)
    ).all()
    return ok({"events": [{"id": x.id, "type": x.event_type, "severity": x.severity, "details": x.details, "createdAt": x.created_at.isoformat()} for x in rows]})


@router.delete("/account")
def delete_account(
    body: DeleteAccountIn,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.confirmation != "DELETE MY DATA":
        return fail("请输入 DELETE MY DATA 确认删除")
    if not verify_password(body.password, user.password_hash):
        return fail("身份验证失败", status_code=401)

    documents = db.scalars(select(Document).where(Document.user_id == user.id)).all()
    for document in documents:
        try:
            path = Path(document.storage_path).resolve()
            if path.is_file():
                path.unlink()
        except OSError:
            pass

    # 上传目录整树删除：多模态 AES 加密文件与文档原件均不残留。
    for user_dir in (UPLOAD_DIR / "multimodal" / user.id, UPLOAD_DIR / user.id):
        if user_dir.is_dir():
            shutil.rmtree(user_dir, ignore_errors=True)

    # 按元数据拓扑顺序「子表先删、父表后删」，避免 PostgreSQL 外键约束导致整单回滚
    # （例如 multimodal_extractions.input_id → multimodal_inputs.id）。
    # 先取出该用户拥有的组织 id：随后的按 user_id 删除会先删掉 organizations 行。
    org_ids = list(db.scalars(select(Organization.id).where(Organization.user_id == user.id)))

    for table in reversed(Base.metadata.sorted_tables):
        if "user_id" in table.c:
            db.execute(delete(table).where(table.c.user_id == user.id))

    # 该用户拥有的组织：其他成员的数据仅按 user_id 删不到，会留下孤儿成员/授权/审计，
    # 且被邀请邮箱重新注册后可能经邮箱匹配「复活」残留成员行。这里按 organization_id 整体清理。
    if org_ids:
        case_ids = list(db.scalars(
            select(EnterpriseCase.id).where(EnterpriseCase.organization_id.in_(org_ids))
        ))
        if case_ids:
            for model in (EnterpriseDocument, EnterpriseRisk, EnterpriseTask, EnterpriseBrief):
                db.execute(delete(model).where(model.case_id.in_(case_ids)))
            db.execute(delete(ProjectGrant).where(ProjectGrant.case_id.in_(case_ids)))
        db.execute(delete(EnterpriseConnector).where(EnterpriseConnector.organization_id.in_(org_ids)))
        db.execute(delete(GovernanceReview).where(GovernanceReview.organization_id.in_(org_ids)))
        db.execute(delete(GovernanceAudit).where(GovernanceAudit.organization_id.in_(org_ids)))
        db.execute(delete(RuleRevision).where(RuleRevision.organization_id.in_(org_ids)))
        db.execute(delete(ModelEvalRun).where(ModelEvalRun.organization_id.in_(org_ids)))
        db.execute(delete(ModelEvalCase).where(ModelEvalCase.organization_id.in_(org_ids)))
        db.execute(delete(EnterpriseRule).where(EnterpriseRule.organization_id.in_(org_ids)))
        db.execute(delete(ProjectGrant).where(ProjectGrant.organization_id.in_(org_ids)))
        db.execute(delete(EnterpriseCase).where(EnterpriseCase.organization_id.in_(org_ids)))
        db.execute(delete(OrganizationMember).where(OrganizationMember.organization_id.in_(org_ids)))
        db.execute(delete(Organization).where(Organization.id.in_(org_ids)))

    db.delete(user)
    db.commit()

    # 失效该用户的派生缓存（对话原文/预测/OCR 等），避免删除后仍可被读取。
    for prefix in (
        f"twin:{user.id}", f"twin:status:{user.id}", f"wi:pred:{user.id}",
        f"wi:chat:{user.id}", f"agent:{user.id}", f"mm:vision:{user.id}",
    ):
        try:
            cache_invalidate_prefix(prefix)
        except Exception:  # noqa: BLE001
            pass
    # 删除回执：审计表随账户一并删除，这里额外写一条不可回删的运行日志作为凭证。
    log_event(logger, "warning", "account.delete.ok", user_id=user.id)
    return ok({"deleted": True}, "账户及关联数据已删除")
