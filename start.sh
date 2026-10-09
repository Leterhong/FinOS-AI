#!/usr/bin/env bash
# FinOS AI 服务启动脚本（生产模式）。
#
# 端口固定：
#   Web (Next.js)  : 3000
#   API (FastAPI)  : 8300
#
# 退出码：
#   0  服务已在运行，或本次启动成功
#   2  启动失败（构建失败 / 进程退出 / 就绪超时）
#
# 说明：
#   - 生产模式构建 + 启动，显式限制 V8 堆上限，规避容器 OOM；
#   - Web 未运行时才清理并重建 .next，避免破坏正在运行的服务；
#   - 已监听则跳过对应进程，避免重复启动；
#   - 不使用 timeout 包裹服务，否则服务会被定时器杀掉。
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

WEB_PORT=3000
WEB_HOST=0.0.0.0
API_PORT=8300
API_HOST=127.0.0.1
RUN_DIR="$ROOT/.run"
LOG_DIR="$RUN_DIR/logs"
DATA_DIR="$ROOT/.data"
SECRETS_FILE="$DATA_DIR/start-secrets.env"
NEXT_BIN="$ROOT/node_modules/next/dist/bin/next"
PYTHON_BIN="${PYTHON_BIN:-python3}"

# 判断端口是否已有进程监听。优先 ss，其次 lsof/netstat，最后用 bash /dev/tcp 回退，
# 兼容 macOS / Alpine 等没有 iproute2 的环境。
port_listening() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | awk -v p=":$port" '$4 ~ p"$" { found = 1 } END { exit found ? 0 : 1 }' && return 0
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1 && return 0
  fi
  if command -v netstat >/dev/null 2>&1; then
    netstat -ltn 2>/dev/null | awk -v p=":$port" '$4 ~ p"$" { found = 1 } END { exit found ? 0 : 1 }' && return 0
  fi
  # bash 内建回退：能建立 TCP 连接即视为在监听。
  if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
    exec 3>&- 3<&-
    return 0
  fi
  return 1
}

mkdir -p "$LOG_DIR" "$DATA_DIR"

WEB_UP=0
API_UP=0
port_listening "$WEB_PORT" && WEB_UP=1
port_listening "$API_PORT" && API_UP=1

# 1) 两个服务都已启动则直接返回 0。
if [ "$WEB_UP" -eq 1 ] && [ "$API_UP" -eq 1 ]; then
  echo "服务已启动：Web $WEB_PORT 与 API $API_PORT 均在监听，跳过启动。"
  exit 0
fi

# 2) 生产模式密钥：缺失的逐项生成并持久化，保证重启后会话与加密数据仍可解密。
ensure_secret() {
  local name="$1" bytes="$2" encoding="$3"
  if [ -f "$SECRETS_FILE" ] && grep -q "^export ${name}=" "$SECRETS_FILE"; then
    return 0
  fi
  local value
  value="$(node -e "console.log(require('crypto').randomBytes(${bytes}).toString('${encoding}'))")"
  printf 'export %s=%s\n' "$name" "$value" >> "$SECRETS_FILE"
}
touch "$SECRETS_FILE"
ensure_secret FINOS_AUTH_SECRET 48 base64url
ensure_secret FINOS_DATA_KEY 48 base64url
ensure_secret JWT_SECRET 48 base64url
ensure_secret ENCRYPTION_MASTER_KEY 32 base64url
chmod 600 "$SECRETS_FILE"
# shellcheck disable=SC1090
source "$SECRETS_FILE"
export FINOS_AUTH_SECRET FINOS_DATA_KEY JWT_SECRET ENCRYPTION_MASTER_KEY

# 可选：全站共享默认模型配置（AI_BASE_URL / AI_MODEL / AI_API_KEY 等）。
# 密钥仅保留在服务端环境变量，绝不下发浏览器。文件每行写 `export KEY=value`。
AI_MODEL_FILE="$DATA_DIR/ai-model.env"
if [ -f "$AI_MODEL_FILE" ]; then
  chmod 600 "$AI_MODEL_FILE" 2>/dev/null || true
  # shellcheck disable=SC1090
  source "$AI_MODEL_FILE"
fi
export NODE_ENV=production
# 统一时区，避免容器默认 UTC 导致「每日 8 点」等调度按 UTC 执行。
export TZ="${TZ:-Asia/Shanghai}"
export FINOS_ALLOW_PRIVATE_AI_ENDPOINTS="${FINOS_ALLOW_PRIVATE_AI_ENDPOINTS:-false}"
export AI_ALLOW_PRIVATE_ENDPOINTS="${AI_ALLOW_PRIVATE_ENDPOINTS:-false}"
export MODE=online

# 3) 启动 Next.js 前端（未运行时）：清缓存 → 生产构建 → 启动。
#    先构建再启动后端，避免后端进程占用内存抬高构建峰值触发 OOM。
if [ "$WEB_UP" -eq 0 ]; then
  rm -rf "$ROOT/.next"
  if ! NODE_OPTIONS="--max-old-space-size=768" NEXT_TELEMETRY_DISABLED=1 node "$NEXT_BIN" build --no-lint > "$LOG_DIR/build.log" 2>&1; then
    echo "启动失败：生产构建未通过，详情见 $LOG_DIR/build.log" >&2
    exit 2
  fi
  nohup node --max-old-space-size=1024 "$NEXT_BIN" start -H "$WEB_HOST" -p "$WEB_PORT" > "$LOG_DIR/web.log" 2>&1 &
  WEB_PID=$!
  echo "$WEB_PID" > "$RUN_DIR/web.pid"
fi

# 4) 启动 FastAPI 后端（未运行时）。先 export 再 nohup，避免环境变量被当命令。
if [ "$API_UP" -eq 0 ]; then
  # 非 SQLite（PostgreSQL 等）时先执行迁移，避免生产库缺表；失败即中止。
  DB_URL_FOR_MIGRATE="${DATABASE_URL:-sqlite://default}"
  if ! printf '%s' "$DB_URL_FOR_MIGRATE" | grep -qi '^sqlite'; then
    echo "检测到非 SQLite 数据库，执行 alembic upgrade head …"
    if ! "$PYTHON_BIN" -m alembic -c backend/alembic.ini upgrade head; then
      echo "启动失败：数据库迁移未通过，请检查 alembic 版本与迁移脚本。" >&2
      exit 2
    fi
  fi
  nohup "$PYTHON_BIN" -m uvicorn backend.main:app --host "$API_HOST" --port "$API_PORT" > "$LOG_DIR/backend.log" 2>&1 &
  API_PID=$!
  echo "$API_PID" > "$RUN_DIR/backend.pid"
fi

# 5) 等待两个端口就绪；任一新进程提前退出或超时都视为失败。
for _ in $(seq 1 150); do
  if port_listening "$WEB_PORT" && port_listening "$API_PORT"; then
    echo "服务启动成功：http://127.0.0.1:$WEB_PORT"
    exit 0
  fi
  if [ "$WEB_UP" -eq 0 ] && [ -n "${WEB_PID:-}" ] && ! kill -0 "$WEB_PID" 2>/dev/null; then
    echo "启动失败：Web 进程已退出，详情见 $LOG_DIR/web.log" >&2
    exit 2
  fi
  if [ "$API_UP" -eq 0 ] && [ -n "${API_PID:-}" ] && ! kill -0 "$API_PID" 2>/dev/null; then
    echo "启动失败：API 进程已退出，详情见 $LOG_DIR/backend.log" >&2
    exit 2
  fi
  sleep 1
done

echo "启动失败：服务未在预期时间内就绪，详情见 $LOG_DIR" >&2
exit 2
