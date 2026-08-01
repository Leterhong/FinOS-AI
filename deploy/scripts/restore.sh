#!/usr/bin/env bash
# FinOS AI — 数据库恢复（Phase 7.0.4 十七、备份机制）
# 用法：BACKUP_DATE=20260101-120000 bash deploy/scripts/restore.sh
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
DATE="${BACKUP_DATE:?请提供 BACKUP_DATE=YYYYMMDD-HHMMSS}"
SRC="${BACKUP_DIR}/${DATE}"
[ -d "$SRC" ] || { echo "备份目录不存在：$SRC"; exit 1; }

echo "==> 恢复 PostgreSQL（finos）"
gunzip -c "$SRC/finos.sql.gz" | docker compose exec -T finos-db psql -U finos -d finos

echo "==> 恢复向量库（finos_vector）"
gunzip -c "$SRC/finos_vector.sql.gz" | docker compose exec -T finos-vector psql -U finos -d finos_vector

echo "==> 恢复上传文件"
docker compose cp "$SRC/uploads" finos-api:/app/backend/data/uploads 2>/dev/null || echo "（无上传文件，跳过）"

echo "==> 恢复完成"
