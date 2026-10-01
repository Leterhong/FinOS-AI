"""backfill: 补齐生产 PostgreSQL 缺失的表与列（与模型定义对齐）。

背景：历史上部分模型仅在 SQLite 开发路径通过 ``init_db()`` 的 create_all 建表，
Alembic 迁移未覆盖，导致全新 PostgreSQL 库在注册/登录（refresh_tokens）、
AI 会话（ai_sessions）、企业治理（governance_*）、连接器（enterprise_connectors）、
RAG（knowledge_chunks）、Agent 任务（agent_tasks）、自动化（automation_*）等处报缺表。

本迁移以「模型定义为唯一真相」：对 Base.metadata 中所有未建的表执行
``create_all(checkfirst=True)``（已存在的表会被跳过），再对既有表幂等补列。

revision = "7f22missingtables"
down_revision = "7f21ruleflags"
"""
from __future__ import annotations

from alembic import op
from sqlalchemy import inspect, text

# 导入全部模型以注册 metadata（与 alembic/env.py 一致）。
from backend.database.base import Base
import backend.user.models  # noqa: F401
import backend.auth.models  # noqa: F401
import backend.financial.models  # noqa: F401
import backend.document.models  # noqa: F401
import backend.memory.models  # noqa: F401
import backend.ai.models  # noqa: F401
import backend.notification.models  # noqa: F401
import backend.services.models  # noqa: F401
import backend.security.models  # noqa: F401
import backend.tasks.models  # noqa: F401
import backend.intelligence.models  # noqa: F401
import backend.multimodal.models  # noqa: F401
import backend.agents.models  # noqa: F401
import backend.report.models  # noqa: F401
import backend.personal_os.models  # noqa: F401
import backend.autonomous.models  # noqa: F401
import backend.enterprise.models  # noqa: F401
import backend.governance.models  # noqa: F401

revision = "7f22missingtables"
down_revision = "7f21ruleflags"
branch_labels = None
depends_on = None


def _add_columns_if_missing(table: str, columns: dict[str, str]) -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if not insp.has_table(table):
        return
    existing = {column["name"] for column in insp.get_columns(table)}
    is_sqlite = bind.dialect.name == "sqlite"
    for name, ddl_type in columns.items():
        if name in existing:
            continue
        clause = f"ALTER TABLE {table} ADD COLUMN {name} {ddl_type}"
        if not is_sqlite:
            clause = f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {name} {ddl_type}"
        bind.execute(text(clause))


def upgrade() -> None:
    bind = op.get_bind()
    # 建缺失表（已存在的表及其索引会被 checkfirst 跳过）。
    Base.metadata.create_all(bind=bind, checkfirst=True)

    # 既有表补列（create_all 不修改已存在表结构）。
    _add_columns_if_missing(
        "ai_usage_logs",
        {
            "provider": "VARCHAR(50)",
            "input_tokens": "INTEGER",
            "output_tokens": "INTEGER",
            "latency_ms": "INTEGER",
        },
    )
    _add_columns_if_missing(
        "organization_members",
        {
            "invited_by": "VARCHAR(32) NOT NULL DEFAULT ''",
            "invite_case_id": "VARCHAR(64) NOT NULL DEFAULT ''",
            "invite_permission": "VARCHAR(24) NOT NULL DEFAULT ''",
            "invite_token": "VARCHAR(64) NOT NULL DEFAULT ''",
        },
    )
    _add_columns_if_missing(
        "organizations",
        {"members_read_all_projects": "BOOLEAN NOT NULL DEFAULT FALSE"},
    )


def downgrade() -> None:
    # 不删除表/列：本迁移仅为对齐 schema，回滚删除会丢数据。
    pass
