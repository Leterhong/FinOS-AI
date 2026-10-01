"""enterprise_rules 增加启用状态与适用行业标签。

Revision ID: 7f21ruleflags
Revises: 7f20memberinvite
Create Date: 2026-10-01
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "7f21ruleflags"
down_revision = "7f20memberinvite"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("enterprise_rules"):
        return
    existing = {column["name"] for column in inspector.get_columns("enterprise_rules")}
    is_sqlite = bind.dialect.name == "sqlite"
    if "enabled" not in existing:
        op.add_column("enterprise_rules", sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()))
        if not is_sqlite:
            op.alter_column("enterprise_rules", "enabled", server_default=None)
    if "industries_json" not in existing:
        op.add_column("enterprise_rules", sa.Column("industries_json", sa.Text(), nullable=False, server_default="[]"))
        if not is_sqlite:
            op.alter_column("enterprise_rules", "industries_json", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("enterprise_rules"):
        return
    existing = {column["name"] for column in inspector.get_columns("enterprise_rules")}
    for name in ("enabled", "industries_json"):
        if name in existing:
            if bind.dialect.name == "sqlite":
                with op.batch_alter_table("enterprise_rules") as batch:
                    batch.drop_column(name)
            else:
                op.drop_column("enterprise_rules", name)
