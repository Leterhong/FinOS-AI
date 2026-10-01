"""企业工作区时间列改为带时区（timestamptz）。

SQLite 无时区概念，跳过；PostgreSQL 上把 naive timestamp 按 UTC 解释后转为 timestamptz，
避免序列化缺少偏移、前端按本地时区解析导致跨设备合并误判。

revision = "7f23enttz"
down_revision = "7f22missingtables"
"""
from __future__ import annotations

from alembic import op

revision = "7f23enttz"
down_revision = "7f22missingtables"
branch_labels = None
depends_on = None

_TABLES = (
    "enterprise_cases",
    "enterprise_documents",
    "enterprise_risks",
    "enterprise_rules",
    "enterprise_tasks",
    "enterprise_briefs",
)


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    for table in _TABLES:
        for column in ("created_at", "updated_at"):
            op.execute(
                f"ALTER TABLE {table} ALTER COLUMN {column} TYPE TIMESTAMPTZ "
                f"USING {column} AT TIME ZONE 'UTC'"
            )


def downgrade() -> None:
    # 不回退为无时区，避免已带偏移的数据丢失时区信息。
    pass
