"""企业子表补充 case_id 索引（快照过滤/级联删除高频使用）。

revision = "7f24entcaseidx"
down_revision = "7f23enttz"
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import inspect

revision = "7f24entcaseidx"
down_revision = "7f23enttz"
branch_labels = None
depends_on = None

_INDEXES = (
    ("ix_enterprise_documents_case", "enterprise_documents"),
    ("ix_enterprise_risks_case", "enterprise_risks"),
    ("ix_enterprise_tasks_case", "enterprise_tasks"),
    ("ix_enterprise_briefs_case", "enterprise_briefs"),
)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    for name, table in _INDEXES:
        if not inspector.has_table(table):
            continue
        existing = {index["name"] for index in inspector.get_indexes(table)}
        if name not in existing:
            op.create_index(name, table, ["case_id"])


def downgrade() -> None:
    for name, table in _INDEXES:
        try:
            op.drop_index(name, table_name=table)
        except Exception:  # noqa: BLE001
            pass
