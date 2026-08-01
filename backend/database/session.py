"""数据库引擎与 Session 管理。

- 生产：PostgreSQL（DATABASE_URL=postgresql://...）
- 开发：SQLite 降级（默认），保证零依赖可跑
- FastAPI 依赖注入：get_db()
"""
from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from backend.config import get_settings

settings = get_settings()

_connect_args = {}
if settings.database_url.startswith("sqlite"):
    _connect_args = {"check_same_thread": False}

engine = create_engine(
    settings.database_url,
    connect_args=_connect_args,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """开发环境建表（生产环境请使用 Alembic 迁移）。"""
    # 导入所有模型以注册到 Base.metadata
    from backend.user import models as _user  # noqa: F401
    from backend.auth import models as _auth  # noqa: F401  Phase 7.6 刷新 Token
    from backend.financial import models as _financial  # noqa: F401
    from backend.document import models as _document  # noqa: F401
    from backend.memory import models as _memory  # noqa: F401
    from backend.ai import models as _ai  # noqa: F401
    from backend.notification import models as _notification  # noqa: F401
    from backend.services import models as _services  # noqa: F401
    from backend.security import models as _security  # noqa: F401
    from backend.tasks import models as _tasks  # noqa: F401
    from backend.intelligence import models as _intelligence  # noqa: F401  Phase 7.1
    from backend.multimodal import models as _multimodal  # noqa: F401  Phase 7.2
    from backend.agents import models as _agents  # noqa: F401  Phase 7.2
    from backend.report import models as _report  # noqa: F401  Phase 7.2
    from backend.personal_os import models as _personal_os  # noqa: F401  Phase 7.3
    from backend.autonomous import models as _autonomous  # noqa: F401  Phase 7.4
    from backend.database.base import Base

    Base.metadata.create_all(bind=engine)
    # Phase 7.6：既有库（如 ai_usage_logs）在模型扩展后缺新列，
    # create_all 不会给已存在表加列，这里幂等补列自愈。
    _ensure_ai_usage_logs_columns(engine)


def _ensure_ai_usage_logs_columns(engine) -> None:
    """Phase 7.6 自愈：ai_usage_logs 既有表缺 provider/input_tokens/output_tokens。

    create_all 仅创建缺失的表、不改已有表结构，因此老库在扩展 AIUsageLog 模型后
    调用 /api/ai/usage 或 _log_usage 写入会触发 OperationalError。启动时幂等补列：
    - SQLite：ALTER TABLE ADD COLUMN
    - PostgreSQL：ALTER TABLE ADD COLUMN IF NOT EXISTS
    """
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    if not insp.has_table("ai_usage_logs"):
        return
    existing = {c["name"] for c in insp.get_columns("ai_usage_logs")}
    needed = {
        "provider": "VARCHAR(50)",
        "input_tokens": "INTEGER",
        "output_tokens": "INTEGER",
        "latency_ms": "INTEGER",
    }
    missing = {col: typ for col, typ in needed.items() if col not in existing}
    if not missing:
        return
    is_sqlite = engine.dialect.name == "sqlite"
    with engine.begin() as conn:
        for col, typ in missing.items():
            stmt = (
                f"ALTER TABLE ai_usage_logs ADD COLUMN {col} {typ}"
                if is_sqlite
                else f"ALTER TABLE ai_usage_logs ADD COLUMN IF NOT EXISTS {col} {typ}"
            )
            conn.execute(text(stmt))
