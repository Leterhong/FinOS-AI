"""automation_market_cache 增加 change_pct 列（缓存命中时保留涨跌幅）。

revision = "7f25mktchg"
down_revision = "7f24entcaseidx"
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "7f25mktchg"
down_revision = "7f24entcaseidx"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("automation_market_cache"):
        return
    existing = {column["name"] for column in inspector.get_columns("automation_market_cache")}
    if "change_pct" not in existing:
        op.add_column("automation_market_cache", sa.Column("change_pct", sa.Float(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("automation_market_cache"):
        return
    existing = {column["name"] for column in inspector.get_columns("automation_market_cache")}
    if "change_pct" in existing:
        op.drop_column("automation_market_cache", "change_pct")
