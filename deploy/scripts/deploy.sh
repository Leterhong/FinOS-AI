#!/usr/bin/env bash
# FinOS AI — 一键部署（Phase 7.0.4 十九、部署测试）
# 用法：bash deploy/scripts/deploy.sh
set -euo pipefail

echo "==> 拉取最新代码（如需）"
git pull --ff-only || true

echo "==> 构建并启动全部服务"
docker compose build
docker compose up -d

echo "==> 等待后端健康检查"
for i in $(seq 1 30); do
  if curl -fsS http://localhost:8300/api/health >/dev/null 2>&1; then
    echo "后端已就绪"
    break
  fi
  sleep 2
done

echo "==> 部署完成。访问 https://<your-domain>"
