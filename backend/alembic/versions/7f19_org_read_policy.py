"""organizations 增加「成员可读全部项目」策略列。

Revision ID: 7f19orgpolicy
Revises: 7f18idx
Create Date: 2026-09-30
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "7f19orgpolicy"
down_revision = "7f18idx"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("organizations"):
        return
    columns = {column["name"] for column in inspector.get_columns("organizations")}
    if "members_read_all_projects" in columns:
        return
    op.add_column(
        "organizations",
        sa.Column("members_read_all_projects", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # SQLite 不支持 ALTER COLUMN，且 server_default 差异不影响业务语义，故跳过。
    if bind.dialect.name != "sqlite":
        op.alter_column("organizations", "members_read_all_projects", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("organizations"):
        return
    columns = {column["name"] for column in inspector.get_columns("organizations")}
    if "members_read_all_projects" in columns:
        # batch 模式在 SQLite 上通过重建表实现，PostgreSQL 上等价于普通 DROP COLUMN。
        with op.batch_alter_table("organizations") as batch:
            batch.drop_column("members_read_all_projects")
