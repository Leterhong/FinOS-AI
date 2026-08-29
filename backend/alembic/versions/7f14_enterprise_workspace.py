"""2.1 企业工作区持久化：项目/资料/风险/规则/任务/投研底稿。

Revision ID: 7f14_enterprise
Revises: 7f13_personal_os
Create Date: 2026-08-29
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "7f14ent"
down_revision = "7f13pos"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "enterprise_cases",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("company", sa.String(length=200), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("industry", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("amount", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=40), nullable=False, server_default="研判中"),
        sa.Column("risk", sa.String(length=20), nullable=False, server_default="medium"),
        sa.Column("progress", sa.Float(), nullable=False, server_default="0"),
        sa.Column("owner", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("next_action", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_enterprise_cases_user", "enterprise_cases", ["user_id"])
    op.create_table(
        "enterprise_documents",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("case_id", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("name", sa.String(length=300), nullable=False),
        sa.Column("kind", sa.String(length=40), nullable=False, server_default="企业资料"),
        sa.Column("status", sa.String(length=40), nullable=False, server_default="解析中"),
        sa.Column("facts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rule_hits", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("analysis", sa.Text(), nullable=True),
        sa.Column("model", sa.String(length=200), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_enterprise_documents_user", "enterprise_documents", ["user_id"])
    op.create_table(
        "enterprise_risks",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("case_id", sa.String(length=64), nullable=False, server_default=""),
        sa.Column("company", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("level", sa.String(length=20), nullable=False, server_default="medium"),
        sa.Column("evidence", sa.Text(), nullable=False),
        sa.Column("rule", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("impact", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False, server_default="待核验"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_enterprise_risks_user", "enterprise_risks", ["user_id"])
    op.create_table(
        "enterprise_rules",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("code", sa.String(length=120), nullable=False),
        sa.Column("name", sa.String(length=300), nullable=False),
        sa.Column("domain", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("version", sa.String(length=40), nullable=False, server_default="v1.0"),
        sa.Column("conditions", sa.Text(), nullable=True),
        sa.Column("coverage", sa.String(length=40), nullable=False, server_default="待测试"),
        sa.Column("coverage_rate", sa.Float(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_enterprise_rules_user", "enterprise_rules", ["user_id"])
    op.create_table(
        "enterprise_tasks",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("case_name", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("assignee", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("due", sa.String(length=40), nullable=False, server_default=""),
        sa.Column("priority", sa.String(length=20), nullable=False, server_default="medium"),
        sa.Column("stage", sa.String(length=40), nullable=False, server_default="待处理"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_enterprise_tasks_user", "enterprise_tasks", ["user_id"])
    op.create_table(
        "enterprise_briefs",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("topic", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("model", sa.String(length=200), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_enterprise_briefs_user", "enterprise_briefs", ["user_id"])


def downgrade() -> None:
    for table in ("enterprise_briefs", "enterprise_tasks", "enterprise_rules", "enterprise_risks", "enterprise_documents", "enterprise_cases"):
        op.drop_table(table)
