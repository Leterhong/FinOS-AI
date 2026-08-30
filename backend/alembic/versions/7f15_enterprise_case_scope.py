"""企业任务与投研底稿增加项目归属，防止跨项目上下文混用。

Revision ID: 7f15scope
Revises: 7f14ent
Create Date: 2026-08-30
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "7f15scope"
down_revision = "7f14ent"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "enterprise_tasks",
        sa.Column("case_id", sa.String(length=64), nullable=False, server_default=""),
    )
    op.add_column(
        "enterprise_briefs",
        sa.Column("case_id", sa.String(length=64), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("enterprise_briefs", "case_id")
    op.drop_column("enterprise_tasks", "case_id")
