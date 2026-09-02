"""治理/企业模型的 organization_id 与复合索引（ORM 声明与迁移对齐）。

Revision ID: 7f18idx
Revises: 7f17ent
Create Date: 2026-08-30
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "7f18idx"
down_revision = "7f17governance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pairs = [
        ("governance_reviews", "governance_reviews", "ix_governance_reviews_org", "organization_id"),
        ("project_grants", "project_grants", "ix_project_grants_org", "organization_id"),
        ("enterprise_connectors", "enterprise_connectors", "ix_enterprise_connectors_org", "organization_id"),
        ("governance_audit", "governance_audit", "ix_governance_audit_org_created", "organization_id"),
        ("model_eval_runs", "model_eval_runs", "ix_model_eval_runs_org", "organization_id"),
        ("model_eval_cases", "model_eval_cases", "ix_model_eval_cases_org", "organization_id"),
        ("rule_revisions", "rule_revisions", "ix_rule_revisions_org", "organization_id"),
        ("organization_members", "organization_members", "ix_organization_members_org", "organization_id"),
    ]
    # 逐个尝试：仅当迁移 7f17 建表时漏建该索引才补建。
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    for table, _, name, column in pairs:
        if not inspector.has_table(table):
            continue
        existing = {ix["name"] for ix in inspector.get_indexes(table)}
        if name not in existing:
            op.create_index(name, table, [column])


def downgrade() -> None:
    for table, _, name, _ in []:
        pass
