#!/usr/bin/env bash
# FinOS AI — 数据库备份（Phase 7.0.4 十七、备份机制）
# 备份：PostgreSQL + 上传文件；并生成 MANIFEST 标注恢复所需密钥（仅名称，不含值）。
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
DATE="$(date +%Y%m%d-%H%M%S)"
DEST="${BACKUP_DIR}/${DATE}"
mkdir -p "$DEST"

echo "==> 备份 PostgreSQL（服务名 db，库名取自 POSTGRES_DB，默认 finos）"
# --clean --if-exists 让恢复到已有库时可覆盖；--no-owner/--no-privileges 便于跨环境恢复。
DUMP_CMD=(docker compose exec -T db pg_dump -U "${POSTGRES_USER:-finos}" --clean --if-exists --no-owner --no-privileges "${POSTGRES_DB:-finos}")
if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  # 备份含 password_hash 与密文 API Key：按需用 AES-256 对称加密落盘。
  "${DUMP_CMD[@]}" | gzip | gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase "$BACKUP_PASSPHRASE" -o "$DEST/finos.sql.gz.gpg"
  DUMP_FILE="finos.sql.gz.gpg"
else
  "${DUMP_CMD[@]}" | gzip > "$DEST/finos.sql.gz"
  DUMP_FILE="finos.sql.gz"
  echo "提示：未设置 BACKUP_PASSPHRASE，备份未加密（含敏感哈希/密文，请妥善保管）。" >&2
fi

[ -s "$DEST/$DUMP_FILE" ] || { echo "备份失败：dump 为空"; exit 1; }

echo "==> 备份上传文件"
docker compose cp api:/app/backend/data/uploads "$DEST/uploads" 2>/dev/null || echo "（无上传文件，跳过）"

echo "==> 记录恢复所需密钥（仅名称）"
cat > "$DEST/MANIFEST.txt" <<EOF
created_at=${DATE}
database=${POSTGRES_DB:-finos}
dump_file=${DUMP_FILE}
encrypted=$([ -n "${BACKUP_PASSPHRASE:-}" ] && echo yes || echo no)
note=恢复除本备份外，还需以下密钥（未包含在备份中，请单独离线保管）：
required_env=ENCRYPTION_MASTER_KEY
required_env=FINOS_DATA_KEY
required_env=FINOS_AUTH_SECRET
required_env=JWT_SECRET
EOF

if [ -z "${ENCRYPTION_MASTER_KEY:-}" ] || [ -z "${FINOS_DATA_KEY:-}" ]; then
  echo "警告：当前环境未设置 ENCRYPTION_MASTER_KEY / FINOS_DATA_KEY；" >&2
  echo "      仅凭本备份无法解密模型密钥与前端密文，请确认已离线保存这些密钥。" >&2
fi

echo "==> 清理超过 ${RETENTION_DAYS} 天的旧备份"
find "$BACKUP_DIR" -maxdepth 1 -type d -mtime "+${RETENTION_DAYS}" -exec rm -rf {} + 2>/dev/null || true

echo "==> 备份完成：$DEST"
