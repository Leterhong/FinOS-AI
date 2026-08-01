# -*- coding: utf-8 -*-
"""
Phase 7.3 FinOS AI Personal OS: 6 new tables + notifications 扩列（category / archived）。

Revision ID: 7f13pos
Revises: 7f12mm
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "7f13pos"
down_revision = "7f12mm"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ---- notifications 扩列 ----
    with op.batch_alter_table("notifications") as batch:
        batch.add_column(sa.Column("category", sa.String(20), server__default="system"))
        batch.add_column(sa.Column("archived", sa.Boolean(), server__default=sa.text("0")))
    op.execute("UPDATE notifications SET category='system' WHERE category IS NULL")
    op.execute("UPDATE notifications SET archived=0 WHERE archived IS NULL")
    op.create_index("ix_notifications_category", "notifications", ["category"])

    # ---- wealth_avatars ----
    op.create_table(
        "wealth_avatars",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("avatar_name", sa.String(120), server__default="我的财富分身"),
        sa.Column("profile_summary", sa.Text(), server__default=""),
        sa.Column("financial_status", sa.Text(), server__default=""),
        sa.Column("life_stage", sa.String(40), server__default=""),
        sa.Column("risk_preference", sa.String(20), server__default="balanced"),
        sa.Column("future_outlook", sa.Text(), server__default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), index=True),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_wealth_avatars_user", "wealth_avatars", ["user_id"])

    # ---- timeline_events ----
    op.create_table(
        "timeline_events",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("title", sa.String(200), server__default=""),
        sa.Column("category", sa.String(10), server__default="future", index=True),
        sa.Column("event_date", sa.String(20), server__default="", index=True),
        sa.Column("description", sa.Text(), server__default=""),
        sa.Column("source", sa.String(10), server__default="system"),
        sa.Column("importance", sa.Float(), server__default="0.5"),
        sa.Column("payload", sa.Text(), server__default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), index=True),
    )
    op.create_index("ix_timeline_events_user_created", "timeline_events", ["user_id", "created_at"])

    # ---- knowledge_items ----
    op.create_table(
        "knowledge_items",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("title", sa.String(200), server__default=""),
        sa.Column("content", sa.Text(), server__default=""),
        sa.Column("source", sa.String(20), server__default="upload", index=True),
        sa.Column("source_ref", sa.String(32), server__default=""),
        sa.Column("category", sa.String(40), server__default="general", index=True),
        sa.Column("tags", sa.Text(), server__default="[]"),
        sa.Column("favorite", sa.Boolean(), server__default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), index=True),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_knowledge_items_user_created", "knowledge_items", ["user_id", "created_at"])

    # ---- decision_journals ----
    op.create_table(
        "decision_journals",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("question", sa.Text(), server__default=""),
        sa.Column("analysis", sa.Text(), server__default=""),
        sa.Column("recommendation", sa.Text(), server__default=""),
        sa.Column("chosen_plan", sa.Text(), server__default=""),
        sa.Column("alternatives", sa.Text(), server__default=""),
        sa.Column("payload", sa.Text(), server__default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), index=True),
    )
    op.create_index("ix_decision_journals_user_created", "decision_journals", ["user_id", "created_at"])

    # ---- plan_versions ----
    op.create_table(
        "plan_versions",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("subject", sa.String(40), server__default="general", index=True),
        sa.Column("version", sa.Integer(), server__default="1"),
        sa.Column("title", sa.String(200), server__default=""),
        sa.Column("content", sa.Text(), server__default=""),
        sa.Column("change_note", sa.Text(), server__default=""),
        sa.Column("payload", sa.Text(), server__default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), index=True),
    )
    op.create_index("ix_plan_versions_user_subject", "plan_versions", ["user_id", "subject"])

    # ---- daily_briefings ----
    op.create_table(
        "daily_briefings",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("brief_date", sa.String(12), server__default="", index=True),
        sa.Column("greeting", sa.Text(), server__default=""),
        sa.Column("wealth_change", sa.Text(), server__default=""),
        sa.Column("reminders", sa.Text(), server__default=""),
        sa.Column("actions", sa.Text(), server__default=""),
        sa.Column("tone", sa.String(10), server__default="neutral"),
        sa.Column("payload", sa.Text(), server__default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), index=True),
    )
    op.create_index("ix_daily_briefings_user_date", "daily_briefings", ["user_id", "brief_date"])


def downgrade() -> None:
    op.drop_index("ix_daily_briefings_user_date", table_name="daily_briefings")
    op.drop_table("daily_briefings")
    op.drop_index("ix_plan_versions_user_subject", table_name="plan_versions")
    op.drop_table("plan_versions")
    op.drop_index("ix_decision_journals_user_created", table_name="decision_journals")
    op.drop_table("decision_journals")
    op.drop_index("ix_knowledge_items_user_created", table_name="knowledge_items")
    op.drop_table("knowledge_items")
    op.drop_index("ix_timeline_events_user_created", table_name="timeline_events")
    op.drop_table("timeline_events")
    op.drop_index("ix_wealth_avatars_user", table_name="wealth_avatars")
    op.drop_table("wealth_avatars")
    op.drop_index("ix_notifications_category", table_name="notifications")
    with op.batch_alter_table("notifications") as batch:
        batch.drop_column("archived")
        batch.drop_column("category")
