#!/usr/bin/env bash
# ============================================================
# FinOS AI Backend 容器入口
# 1) 等待数据库可连接（最多 60s）
# 2) 执行 Alembic 迁移到 head
# 3) 交给 CMD 启动 uvicorn
# ============================================================
set -euo pipefail

echo "[entrypoint] DATABASE_URL=${DATABASE_URL:-<unset, fallback sqlite>}"

if [ -n "${DATABASE_URL:-}" ] && echo "${DATABASE_URL}" | grep -q "postgresql"; then
  echo "[entrypoint] 等待 PostgreSQL 就绪…"
  for i in $(seq 1 30); do
    if python - <<'PY'
import os, sys
from sqlalchemy import create_engine, text
try:
    e = create_engine(os.environ["DATABASE_URL"], pool_pre_ping=True)
    with e.connect() as c:
        c.execute(text("SELECT 1"))
except Exception:
    sys.exit(1)
PY
    then
      echo "[entrypoint] PostgreSQL 已就绪（第 ${i} 次探测）"
      break
    fi
    sleep 2
  done
fi

echo "[entrypoint] 执行数据库迁移 alembic upgrade head"
if ! alembic -c backend/alembic.ini upgrade head; then
  echo "[entrypoint] 迁移失败，回退到 SQLAlchemy create_all 建表" >&2
  python -c "from backend.database.session import init_db; init_db()"
fi

echo "[entrypoint] 启动服务：$*"
exec "$@"
