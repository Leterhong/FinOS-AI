"""Phase 7.2 Multimodal Intelligence + AI Agent Ecosystem: 5 new tables.

Revision ID: 7f12mm
Revises: 7f11intel
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "7f12mm"
down_revision = "7f11intel"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "multimodal_inputs",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("modality", sa.String(20), server_default="text", index=True),
        sa.Column("subtype", sa.String(40), server_default=""),
        sa.Column("filename", sa.String(300), server_default=""),
        sa.Column("mime", sa.String(120), server_default=""),
        sa.Column("size_bytes", sa.Integer(), server_default="0"),
        sa.Column("content_hash", sa.String(64), server_default="", index=True),
        sa.Column("storage_path", sa.Text(), nullable=True),
        sa.Column("raw_text", sa.Text(), nullable=True),
        sa.Column("summary", sa.Text(), server_default=""),
        sa.Column("tier", sa.String(10), server_default="local"),
        sa.Column("status", sa.String(20), server_default="received", index=True),
        sa.Column("error", sa.Text(), server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), index=True),
    )
    op.create_index("ix_multimodal_inputs_user_created", "multimodal_inputs", ["user_id", "created_at"])
    op.create_index("ix_multimodal_inputs_user_hash", "multimodal_inputs", ["user_id", "content_hash"])

    op.create_table(
        "multimodal_extractions",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("input_id", sa.String(32), sa.ForeignKey("multimodal_inputs.id"), nullable=False, index=True),
        sa.Column("kind", sa.String(20), server_default="asset", index=True),
        sa.Column("label", sa.String(200), server_default=""),
        sa.Column("asset_type", sa.String(30), server_default="other"),
        sa.Column("amount", sa.Float(), server_default="0"),
        sa.Column("currency", sa.String(10), server_default="CNY"),
        sa.Column("occurred_at", sa.String(40), server_default=""),
        sa.Column("confidence", sa.Float(), server_default="0.5"),
        sa.Column("evidence", sa.Text(), server_default=""),
        sa.Column("payload", sa.Text(), server_default="{}"),
        sa.Column("status", sa.String(20), server_default="needs_confirm", index=True),
        sa.Column("applied", sa.Boolean(), server_default=sa.text("0")),
        sa.Column("applied_ref", sa.String(32), server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), index=True),
    )
    op.create_index(
        "ix_multimodal_extractions_user_created", "multimodal_extractions", ["user_id", "created_at"]
    )
    op.create_index(
        "ix_multimodal_extractions_user_status", "multimodal_extractions", ["user_id", "status"]
    )

    op.create_table(
        "user_agent_configs",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("agent_name", sa.String(50), nullable=False, index=True),
        sa.Column("enabled", sa.Boolean(), server_default=sa.text("1")),
        sa.Column("priority", sa.Integer(), server_default="100"),
        sa.Column("focus", sa.String(200), server_default=""),
        sa.Column("settings", sa.Text(), server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), index=True),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_user_agent_configs_user_created", "user_agent_configs", ["user_id", "created_at"])
    op.create_index("ix_user_agent_configs_user_agent", "user_agent_configs", ["user_id", "agent_name"])

    op.create_table(
        "agent_run_logs",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("kind", sa.String(20), server_default="agent", index=True),
        sa.Column("agent_name", sa.String(50), server_default="", index=True),
        sa.Column("question", sa.Text(), server_default=""),
        sa.Column("tier", sa.String(10), server_default="local"),
        sa.Column("ok", sa.Boolean(), server_default=sa.text("1")),
        sa.Column("elapsed_ms", sa.Integer(), server_default="0"),
        sa.Column("trace", sa.Text(), server_default="[]"),
        sa.Column("result", sa.Text(), server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), index=True),
    )
    op.create_index("ix_agent_run_logs_user_created", "agent_run_logs", ["user_id", "created_at"])

    op.create_table(
        "wealth_reports",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("kind", sa.String(30), server_default="monthly", index=True),
        sa.Column("title", sa.String(200), server_default=""),
        sa.Column("period", sa.String(40), server_default=""),
        sa.Column("tier", sa.String(10), server_default="local"),
        sa.Column("content", sa.Text(), server_default=""),
        sa.Column("payload", sa.Text(), server_default="{}"),
        sa.Column("section_count", sa.Integer(), server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), index=True),
    )
    op.create_index("ix_wealth_reports_user_created", "wealth_reports", ["user_id", "created_at"])


def downgrade() -> None:
    for table in (
        "wealth_reports",
        "agent_run_logs",
        "user_agent_configs",
        "multimodal_extractions",
        "multimodal_inputs",
    ):
        op.drop_table(table)
