"""organization_members 增加邀请即授权相关列。

Revision ID: 7f20memberinvite
Revises: 7f19orgpolicy
Create Date: 2026-10-01
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "7f20memberinvite"
down_revision = "7f19orgpolicy"
branch_labels = None
depends_on = None

_COLUMNS = {
    "invited_by": sa.String(32),
    "invite_case_id": sa.String(64),
    "invite_permission": sa.String(24),
}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("organization_members"):
        return
    existing = {column["name"] for column in inspector.get_columns("organization_members")}
    is_sqlite = bind.dialect.name == "sqlite"
    for name, type_ in _COLUMNS.items():
        if name in existing:
            continue
        op.add_column("organization_members", sa.Column(name, type_, nullable=False, server_default=""))
        # SQLite 不支持 ALTER COLUMN；server_default 差异不影响业务语义。
        if not is_sqlite:
            op.alter_column("organization_members", name, server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("organization_members"):
        return
    existing = {column["name"] for column in inspector.get_columns("organization_members")}
    for name in _COLUMNS:
        if name in existing:
            if bind.dialect.name == "sqlite":
                # SQLite 通过 batch 重建表完成删列。
                with op.batch_alter_table("organization_members") as batch:
                    batch.drop_column(name)
            else:
                op.drop_column("organization_members", name)
