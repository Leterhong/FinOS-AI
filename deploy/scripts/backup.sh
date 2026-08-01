#!/usr/bin/env bash
# FinOS AI — 数据库备份（Phase 7.0.4 十七、备份机制）
# 备份：用户数据 / 财富数据 / Memory / 配置（PostgreSQL + 上传文件）
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
DATE="$(date +%Y%m%d-%H%M%S)"
DEST="${BACKUP_DIR}/${DATE}"
mkdir -p "$DEST"

echo "==> 备份 PostgreSQL（finos）"
docker compose exec -T finos-db pg_dump -U finos finos | gzip > "$DEST/finos.sql.gz"

echo "==> 备份向量库（finos_vector）"
docker compose exec -T finos-vector pg_dump -U finos finos_vector | gzip > "$DEST/finos_vector.sql.gz"

echo "==> 备份上传文件"
docker compose cp finos-api:/app/backend/data/uploads "$DEST/uploads" 2>/dev/null || echo "（无上传文件，跳过）"

echo "==> 备份完成：$DEST"
