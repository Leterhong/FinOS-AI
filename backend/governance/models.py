"""企业治理域模型。所有记录均可追溯到组织、操作者和业务资源。"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from backend.database.base import Base


def _id() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    user_id: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class OrganizationMember(Base):
    __tablename__ = "organization_members"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    organization_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    user_id: Mapped[str | None] = mapped_column(String(32), index=True, nullable=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(24), nullable=False, default="viewer")
    clearance: Mapped[str] = mapped_column(String(24), nullable=False, default="internal")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    __table_args__ = (UniqueConstraint("organization_id", "email", name="uq_org_member_email"),)


class ProjectGrant(Base):
    __tablename__ = "project_grants"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    organization_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    case_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    permission: Mapped[str] = mapped_column(String(24), nullable=False, default="viewer")
    granted_by: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    __table_args__ = (UniqueConstraint("case_id", "user_id", name="uq_project_grant_user"),)


class GovernanceAudit(Base):
    __tablename__ = "governance_audit_logs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    organization_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False, default="")
    user_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    case_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False, default="")
    action: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    resource_type: Mapped[str] = mapped_column(String(40), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(100), nullable=False)
    outcome: Mapped[str] = mapped_column(String(20), nullable=False, default="success")
    details_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    ip: Mapped[str] = mapped_column(String(64), nullable=False, default="internal")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (Index("ix_governance_audit_org_created", "organization_id", "created_at"),)


class RuleRevision(Base):
    __tablename__ = "enterprise_rule_revisions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    organization_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False, default="")
    user_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    rule_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    version: Mapped[str] = mapped_column(String(40), nullable=False)
    snapshot_json: Mapped[str] = mapped_column(Text, nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False, default="规则保存")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)


class GovernanceReview(Base):
    __tablename__ = "governance_reviews"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    organization_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    case_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False, default="")
    resource_type: Mapped[str] = mapped_column(String(40), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    assigned_role: Mapped[str] = mapped_column(String(24), nullable=False, default="reviewer")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    requested_by: Mapped[str] = mapped_column(String(120), nullable=False)
    decided_by: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    decision_note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ModelEvalCase(Base):
    __tablename__ = "model_eval_cases"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    organization_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    expected_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    forbidden_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ModelEvalRun(Base):
    __tablename__ = "model_eval_runs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    organization_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    eval_case_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    model_id: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    output: Mapped[str] = mapped_column(Text, nullable=False, default="")
    score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    guard_flags_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    review_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    latency_ms: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)


class EnterpriseConnector(Base):
    __tablename__ = "enterprise_connectors"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_id)
    organization_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    case_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[str] = mapped_column(String(30), nullable=False, default="json_api")
    source_url: Mapped[str] = mapped_column(String(500), nullable=False)
    secret_encrypted: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="unverified")
    last_error: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    last_sync_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
