"""企业研判证据链、规则测试与流程审计字段。

Revision ID: 7f16evidence
Revises: 7f15scope
Create Date: 2026-08-30
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "7f16evidence"
down_revision = "7f15scope"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("enterprise_cases", sa.Column("archived_at", sa.String(length=40), nullable=False, server_default=""))
    op.add_column("enterprise_documents", sa.Column("evidence_json", sa.Text(), nullable=True))
    op.add_column("enterprise_risks", sa.Column("review_json", sa.Text(), nullable=True))
    op.add_column("enterprise_rules", sa.Column("tests_json", sa.Text(), nullable=True))
    op.add_column("enterprise_tasks", sa.Column("note", sa.Text(), nullable=False, server_default=""))
    op.add_column("enterprise_tasks", sa.Column("history_json", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("enterprise_tasks", "history_json")
    op.drop_column("enterprise_tasks", "note")
    op.drop_column("enterprise_rules", "tests_json")
    op.drop_column("enterprise_risks", "review_json")
    op.drop_column("enterprise_documents", "evidence_json")
    op.drop_column("enterprise_cases", "archived_at")
