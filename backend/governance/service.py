"""企业治理权限、分级与审计公共服务。"""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.enterprise.models import EnterpriseCase, EnterpriseRule
from backend.governance.models import (
    GovernanceAudit,
    Organization,
    OrganizationMember,
    ProjectGrant,
    RuleRevision,
)
from backend.security.audit import client_ip
from backend.user.models import User

ROLE_ORDER = {"viewer": 0, "reviewer": 1, "analyst": 2, "admin": 3, "owner": 4}
PERMISSION_ORDER = {"viewer": 0, "reviewer": 1, "editor": 2, "admin": 3}
CLASSIFICATION_ORDER = {"public": 0, "internal": 1, "confidential": 2, "restricted": 3}


def ensure_default_organization(db: Session, user: User) -> Organization:
    org = db.scalar(select(Organization).where(Organization.user_id == user.id).order_by(Organization.created_at))
    if org is None:
        org = Organization(user_id=user.id, name="企业研判工作区")
        db.add(org)
        try:
            db.flush()
        except IntegrityError:
            # 并发首触（多 worker 同一用户）会撞 user_id 唯一约束——回滚后重读即可。
            db.rollback()
            org = db.scalar(select(Organization).where(Organization.user_id == user.id).order_by(Organization.created_at))
            if org is None:
                raise
    member = db.scalar(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == org.id,
            OrganizationMember.email == user.email,
        )
    )
    if member is None:
        db.add(
            OrganizationMember(
                organization_id=org.id,
                user_id=user.id,
                email=user.email,
                role="owner",
                clearance="restricted",
                status="active",
            )
        )
        db.flush()
    # 2.1 及更早版本没有 organization_id。用户首次进入治理域时幂等归并到
    # 其默认组织，避免老项目可查看却无法授权、分级或生成组织审计。
    db.execute(
        update(EnterpriseCase)
        .where(EnterpriseCase.user_id == user.id, EnterpriseCase.organization_id == "")
        .values(organization_id=org.id)
    )
    db.execute(
        update(EnterpriseRule)
        .where(EnterpriseRule.user_id == user.id, EnterpriseRule.organization_id == "")
        .values(organization_id=org.id)
    )
    return org


def memberships_for_user(db: Session, user: User) -> list[OrganizationMember]:
    rows = list(
        db.scalars(
            select(OrganizationMember).where(
                or_(OrganizationMember.user_id == user.id, OrganizationMember.email == user.email),
                OrganizationMember.status == "active",
            )
        )
    )
    changed = False
    for row in rows:
        if row.user_id is None:
            row.user_id = user.id
            changed = True
    if changed:
        db.flush()
    return rows


def member_for_organization(db: Session, user: User, organization_id: str) -> OrganizationMember | None:
    return next((m for m in memberships_for_user(db, user) if m.organization_id == organization_id), None)


def has_org_role(db: Session, user: User, organization_id: str, minimum: str) -> bool:
    member = member_for_organization(db, user, organization_id)
    return bool(member and ROLE_ORDER.get(member.role, -1) >= ROLE_ORDER.get(minimum, 99))


def can_access_case(db: Session, user: User, case: EnterpriseCase, required: str = "viewer") -> bool:
    if case.user_id == user.id:
        return True
    organization_id = case.organization_id or ""
    member = member_for_organization(db, user, organization_id) if organization_id else None
    if member is None:
        return False
    if CLASSIFICATION_ORDER.get(member.clearance, -1) < CLASSIFICATION_ORDER.get(case.classification, 1):
        return False
    if member.role in {"owner", "admin"}:
        return True
    grant = db.scalar(
        select(ProjectGrant).where(ProjectGrant.case_id == case.id, ProjectGrant.user_id == user.id)
    )
    return bool(
        grant
        and PERMISSION_ORDER.get(grant.permission, -1) >= PERMISSION_ORDER.get(required, 99)
    )


def accessible_cases(db: Session, user: User, required: str = "viewer") -> list[EnterpriseCase]:
    memberships = memberships_for_user(db, user)
    org_ids = [m.organization_id for m in memberships]
    candidates = list(
        db.scalars(
            select(EnterpriseCase).where(
                or_(EnterpriseCase.user_id == user.id, EnterpriseCase.organization_id.in_(org_ids or [""]))
            )
        )
    )
    return [case for case in candidates if can_access_case(db, user, case, required)]


def rule_accessible(db: Session, user: User, rule: EnterpriseRule, required_role: str = "viewer") -> bool:
    if rule.user_id == user.id:
        return True
    return bool(rule.organization_id and has_org_role(db, user, rule.organization_id, required_role))


def record_governance_audit(
    db: Session,
    *,
    user: User,
    action: str,
    resource_type: str,
    resource_id: str,
    organization_id: str = "",
    case_id: str = "",
    outcome: str = "success",
    details: dict[str, Any] | None = None,
    request=None,
) -> None:
    safe_details = json.dumps(details or {}, ensure_ascii=False, default=str)
    db.add(
        GovernanceAudit(
            organization_id=organization_id,
            user_id=user.id,
            case_id=case_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            outcome=outcome,
            details_json=safe_details[:10_000],
            ip=client_ip(request),
        )
    )


def rule_snapshot(rule: EnterpriseRule) -> dict[str, Any]:
    def parse(raw: str | None, fallback: Any) -> Any:
        try:
            return json.loads(raw) if raw else fallback
        except json.JSONDecodeError:
            return fallback

    return {
        "code": rule.code,
        "name": rule.name,
        "domain": rule.domain,
        "version": rule.version,
        "conditions": parse(rule.conditions, []),
        "coverage": rule.coverage,
        "coverageRate": rule.coverage_rate,
        "testRecords": parse(rule.tests_json, []),
    }


def record_rule_revision(
    db: Session,
    *,
    rule: EnterpriseRule,
    user: User,
    reason: str,
) -> RuleRevision:
    revision = RuleRevision(
        organization_id=rule.organization_id or "",
        user_id=user.id,
        rule_id=rule.id,
        version=rule.version,
        snapshot_json=json.dumps(rule_snapshot(rule), ensure_ascii=False),
        reason=reason[:500],
    )
    db.add(revision)
    return revision
