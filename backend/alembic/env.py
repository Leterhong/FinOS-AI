"""Alembic 迁移环境：连接串来自 backend/.env（与应用一致）。"""
from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from backend.config import get_settings
from backend.database.base import Base

# 导入全部模型注册 metadata
from backend.user import models as _user  # noqa: F401
from backend.auth import models as _auth  # noqa: F401
from backend.financial import models as _financial  # noqa: F401
from backend.document import models as _document  # noqa: F401
from backend.memory import models as _memory  # noqa: F401
from backend.ai import models as _ai  # noqa: F401
from backend.notification import models as _notification  # noqa: F401
from backend.services import models as _services  # noqa: F401
from backend.security import models as _security  # noqa: F401
from backend.tasks import models as _tasks  # noqa: F401
from backend.intelligence import models as _intelligence  # noqa: F401
from backend.multimodal import models as _multimodal  # noqa: F401
from backend.agents import models as _agents  # noqa: F401
from backend.report import models as _report  # noqa: F401
from backend.personal_os import models as _personal_os  # noqa: F401
from backend.autonomous import models as _autonomous  # noqa: F401
from backend.enterprise import models as _enterprise  # noqa: F401
from backend.governance import models as _governance  # noqa: F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", get_settings().database_url)
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
