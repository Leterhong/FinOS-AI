#!/usr/bin/env bash
# FinOS AI — 数据库备份（Phase 7.0.4 十七、备份机制）
# 备份：用户数据 / 财富数据 / Memory / 配置（PostgreSQL + 上传文件）
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
DATE="$(date +%Y%m%d-%H%M%S)"
DEST="${BACKUP_DIR}/${DATE}"
mkdir -p "$DEST"

echo "==> 备份 PostgreSQL（服务名 db，库名取自 POSTGRES_DB，默认 finos）"
docker compose exec -T db pg_dump -U "${POSTGRES_USER:-finos}" "${POSTGRES_DB:-finos}" | gzip > "$DEST/finos.sql.gz"

echo "==> 备份上传文件"
docker compose cp api:/app/backend/data/uploads "$DEST/uploads" 2>/dev/null || echo "（无上传文件，跳过）"

echo "==> 备份完成：$DEST"
