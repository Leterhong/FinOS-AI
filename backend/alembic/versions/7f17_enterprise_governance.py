"""企业组织治理、规则历史、模型评测、复核与连接器。

Revision ID: 7f17governance
Revises: 7f16evidence
Create Date: 2026-08-31
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "7f17governance"
down_revision = "7f16evidence"
branch_labels = None
depends_on = None


def _common(name: str, *columns: sa.Column) -> None:
    op.create_table(
        name,
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("user_id", sa.String(32), nullable=False),
        *columns,
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    op.create_index(f"ix_{name}_user_id", name, ["user_id"])


def upgrade() -> None:
    op.add_column("enterprise_cases", sa.Column("organization_id", sa.String(32), nullable=False, server_default=""))
    op.add_column("enterprise_cases", sa.Column("classification", sa.String(24), nullable=False, server_default="internal"))
    op.create_index("ix_enterprise_cases_org", "enterprise_cases", ["organization_id"])
    op.add_column("enterprise_documents", sa.Column("classification", sa.String(24), nullable=False, server_default="internal"))
    op.add_column("enterprise_rules", sa.Column("organization_id", sa.String(32), nullable=False, server_default=""))
    op.create_index("ix_enterprise_rules_org", "enterprise_rules", ["organization_id"])

    op.create_table(
        "organizations",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("user_id", sa.String(32), nullable=False, unique=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_organizations_user_id", "organizations", ["user_id"])
    op.create_table(
        "organization_members",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("organization_id", sa.String(32), nullable=False),
        sa.Column("user_id", sa.String(32)),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("role", sa.String(24), nullable=False),
        sa.Column("clearance", sa.String(24), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("organization_id", "email", name="uq_org_member_email"),
    )
    op.create_index("ix_organization_members_organization_id", "organization_members", ["organization_id"])
    op.create_index("ix_organization_members_user_id", "organization_members", ["user_id"])
    op.create_table(
        "project_grants",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("organization_id", sa.String(32), nullable=False),
        sa.Column("case_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(32), nullable=False),
        sa.Column("permission", sa.String(24), nullable=False),
        sa.Column("granted_by", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("case_id", "user_id", name="uq_project_grant_user"),
    )
    op.create_index("ix_project_grants_case_id", "project_grants", ["case_id"])
    op.create_index("ix_project_grants_user_id", "project_grants", ["user_id"])

    _common(
        "governance_audit_logs",
        sa.Column("organization_id", sa.String(32), nullable=False),
        sa.Column("case_id", sa.String(64), nullable=False),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("resource_type", sa.String(40), nullable=False),
        sa.Column("resource_id", sa.String(100), nullable=False),
        sa.Column("outcome", sa.String(20), nullable=False),
        sa.Column("details_json", sa.Text(), nullable=False),
        sa.Column("ip", sa.String(64), nullable=False),
    )
    _common(
        "enterprise_rule_revisions",
        sa.Column("organization_id", sa.String(32), nullable=False),
        sa.Column("rule_id", sa.String(64), nullable=False),
        sa.Column("version", sa.String(40), nullable=False),
        sa.Column("snapshot_json", sa.Text(), nullable=False),
        sa.Column("reason", sa.String(500), nullable=False),
    )
    _common(
        "governance_reviews",
        sa.Column("organization_id", sa.String(32), nullable=False),
        sa.Column("case_id", sa.String(64), nullable=False),
        sa.Column("resource_type", sa.String(40), nullable=False),
        sa.Column("resource_id", sa.String(100), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("assigned_role", sa.String(24), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("requested_by", sa.String(120), nullable=False),
        sa.Column("decided_by", sa.String(120), nullable=False),
        sa.Column("decision_note", sa.Text(), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True)),
    )
    _common(
        "model_eval_cases",
        sa.Column("organization_id", sa.String(32), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("expected_json", sa.Text(), nullable=False),
        sa.Column("forbidden_json", sa.Text(), nullable=False),
    )
    _common(
        "model_eval_runs",
        sa.Column("organization_id", sa.String(32), nullable=False),
        sa.Column("eval_case_id", sa.String(32), nullable=False),
        sa.Column("model_id", sa.String(120), nullable=False),
        sa.Column("output", sa.Text(), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("passed", sa.Boolean(), nullable=False),
        sa.Column("guard_flags_json", sa.Text(), nullable=False),
        sa.Column("review_status", sa.String(20), nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
    )
    _common(
        "enterprise_connectors",
        sa.Column("organization_id", sa.String(32), nullable=False),
        sa.Column("case_id", sa.String(64), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("source_url", sa.String(500), nullable=False),
        sa.Column("secret_encrypted", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("last_error", sa.String(300), nullable=False),
        sa.Column("last_sync_json", sa.Text(), nullable=False),
        sa.Column("last_synced_at", sa.DateTime(timezone=True)),
    )


def downgrade() -> None:
    for table in (
        "enterprise_connectors",
        "model_eval_runs",
        "model_eval_cases",
        "governance_reviews",
        "enterprise_rule_revisions",
        "governance_audit_logs",
        "project_grants",
        "organization_members",
        "organizations",
    ):
        op.drop_table(table)
    op.drop_index("ix_enterprise_rules_org", table_name="enterprise_rules")
    op.drop_column("enterprise_rules", "organization_id")
    op.drop_column("enterprise_documents", "classification")
    op.drop_index("ix_enterprise_cases_org", table_name="enterprise_cases")
    op.drop_column("enterprise_cases", "classification")
    op.drop_column("enterprise_cases", "organization_id")
