#!/usr/bin/env bash
# FinOS AI — 数据库恢复（Phase 7.0.4 十七、备份机制）
# 用法：BACKUP_DATE=20260101-120000 bash deploy/scripts/restore.sh
#   加密备份需同时提供 BACKUP_PASSPHRASE。
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
DATE="${BACKUP_DATE:?请提供 BACKUP_DATE=YYYYMMDD-HHMMSS}"
SRC="${BACKUP_DIR}/${DATE}"
[ -d "$SRC" ] || { echo "备份目录不存在：$SRC"; exit 1; }

if [ -s "$SRC/finos.sql.gz.gpg" ]; then
  DUMP="$SRC/finos.sql.gz.gpg"
  [ -n "${BACKUP_PASSPHRASE:-}" ] || { echo "该备份已加密，请提供 BACKUP_PASSPHRASE"; exit 1; }
elif [ -s "$SRC/finos.sql.gz" ]; then
  DUMP="$SRC/finos.sql.gz"
else
  echo "备份文件缺失或为空：$SRC（未找到 finos.sql.gz[.gpg]）"; exit 1
fi

echo "==> 停止 API 写入，避免恢复期间脏写"
docker compose stop api >/dev/null 2>&1 || true

echo "==> 恢复 PostgreSQL（服务名 db；遇错即停并在单事务内完成）"
# ON_ERROR_STOP=1 + --single-transaction：任何错误都回滚并返回非零，避免半恢复。
if [ "${DUMP##*.}" = "gpg" ]; then
  gpg --batch --yes --decrypt --passphrase "$BACKUP_PASSPHRASE" "$DUMP" \
    | gunzip \
    | docker compose exec -T db psql -v ON_ERROR_STOP=1 --single-transaction -U "${POSTGRES_USER:-finos}" -d "${POSTGRES_DB:-finos}"
else
  gunzip -c "$DUMP" \
    | docker compose exec -T db psql -v ON_ERROR_STOP=1 --single-transaction -U "${POSTGRES_USER:-finos}" -d "${POSTGRES_DB:-finos}"
fi

echo "==> 恢复上传文件"
# 使用 /. 语义，避免目标已存在时被嵌套成 uploads/uploads。
docker compose cp "$SRC/uploads/." api:/app/backend/data/uploads/ 2>/dev/null || echo "（无上传文件，跳过）"

echo "==> 重新启动 API"
docker compose start api >/dev/null 2>&1 || true

echo "==> 恢复完成"
