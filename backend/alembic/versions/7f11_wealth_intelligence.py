"""Phase 7.1 Wealth Intelligence Engine: 5 new tables.

Revision ID: 7f11intel
Revises: 7f04perf
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "7f11intel"
down_revision = "7f04perf"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "wealth_predictions",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("horizon_years", sa.Integer(), server_default="10"),
        sa.Column("net_worth_1y", sa.Float(), server_default="0"),
        sa.Column("net_worth_5y", sa.Float(), server_default="0"),
        sa.Column("net_worth_10y", sa.Float(), server_default="0"),
        sa.Column("retirement_gap", sa.Float(), server_default="0"),
        sa.Column("goal_probability", sa.Float(), server_default="0"),
        sa.Column("assumptions", sa.Text(), server_default="{}"),
        sa.Column("payload", sa.Text(), server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), index=True),
    )
    op.create_index("ix_wealth_predictions_user_created", "wealth_predictions", ["user_id", "created_at"])

    op.create_table(
        "scenario_simulations",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("event_type", sa.String(40), server_default="custom", index=True),
        sa.Column("label", sa.String(200), server_default=""),
        sa.Column("params", sa.Text(), server_default="{}"),
        sa.Column("baseline", sa.Text(), server_default="{}"),
        sa.Column("scenario", sa.Text(), server_default="{}"),
        sa.Column("impact", sa.Text(), server_default="{}"),
        sa.Column("explanation", sa.Text(), server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), index=True),
    )
    op.create_index("ix_scenario_simulations_user_created", "scenario_simulations", ["user_id", "created_at"])

    op.create_table(
        "wealth_strategies",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("horizon", sa.String(20), server_default="short", index=True),
        sa.Column("plan_key", sa.String(10), server_default="A", index=True),
        sa.Column("title", sa.String(200), server_default=""),
        sa.Column("actions", sa.Text(), server_default="[]"),
        sa.Column("expected_effect", sa.Text(), server_default="{}"),
        sa.Column("tier", sa.String(10), server_default="local"),
        sa.Column("created_at", sa.DateTime(timezone=True), index=True),
    )
    op.create_index("ix_wealth_strategies_user_created", "wealth_strategies", ["user_id", "created_at"])

    op.create_table(
        "health_score_history",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("total_score", sa.Integer(), server_default="0"),
        sa.Column("asset_score", sa.Integer(), server_default="0"),
        sa.Column("cashflow_score", sa.Integer(), server_default="0"),
        sa.Column("risk_score", sa.Integer(), server_default="0"),
        sa.Column("goal_score", sa.Integer(), server_default="0"),
        sa.Column("investment_score", sa.Integer(), server_default="0"),
        sa.Column("protection_score", sa.Integer(), server_default="0"),
        sa.Column("detail", sa.Text(), server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), index=True),
    )
    op.create_index("ix_health_score_history_user_created", "health_score_history", ["user_id", "created_at"])

    op.create_table(
        "long_term_memories",
        sa.Column("id", sa.String(32), primary_key=True),
        sa.Column("user_id", sa.String(32), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("kind", sa.String(30), server_default="preference", index=True),
        sa.Column("key", sa.String(120), server_default="", index=True),
        sa.Column("content", sa.Text(), server_default=""),
        sa.Column("payload", sa.Text(), server_default="{}"),
        sa.Column("importance", sa.Float(), server_default="0.5"),
        sa.Column("hit_count", sa.Integer(), server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), index=True),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_long_term_memories_user_kind", "long_term_memories", ["user_id", "kind"])
    op.create_index("ix_long_term_memories_user_key", "long_term_memories", ["user_id", "key"])


def downgrade() -> None:
    for table in (
        "long_term_memories",
        "health_score_history",
        "wealth_strategies",
        "scenario_simulations",
        "wealth_predictions",
    ):
        op.drop_table(table)
