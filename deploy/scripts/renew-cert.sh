#!/usr/bin/env bash
# FinOS AI — Let's Encrypt 证书续期 + 重载 nginx
# 建议由宿主机 cron 每天执行一次，例如：
#   0 3 * * * cd /path/to/FinOS-AI && bash deploy/scripts/renew-cert.sh >> /var/log/finos-cert.log 2>&1
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f docker-compose.yml -f docker-compose.prod.yml)

echo "==> 执行 certbot renew"
"${COMPOSE[@]}" --profile certbot run --rm certbot renew \
  --webroot -w /var/www/certbot --quiet

echo "==> 重载 nginx 使新证书生效"
"${COMPOSE[@]}" exec -T nginx nginx -s reload || echo "（nginx 未运行，跳过 reload）"

echo "==> 续期完成"
