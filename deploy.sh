#!/usr/bin/env bash
# ============================================================
# FinOS AI — 一键部署脚本（Phase 7.5 #364）
#
#   bash deploy.sh                 本地/内网部署（HTTP，端口 80）
#   bash deploy.sh --prod          生产部署（HTTPS，需要证书）
#   bash deploy.sh --pull          先 git pull 再部署
#   bash deploy.sh --rebuild       强制无缓存重建镜像
#   bash deploy.sh --down          停止并移除全部服务（保留数据卷）
#   bash deploy.sh --logs          跟随查看全部服务日志
#
# 脚本会自动完成：
#   1. 检查 docker / docker compose 是否可用
#   2. 首次运行时由 .env.example 生成 .env，并随机生成所有密钥
#   3. 构建镜像并启动服务
#   4. 轮询各服务 healthcheck，直到全部 healthy 或超时报错
# ============================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILES=(-f docker-compose.yml)
DO_PULL=false
NO_CACHE=false
MODE="dev"
ACTION="up"

for arg in "$@"; do
  case "$arg" in
    --prod)    COMPOSE_FILES+=(-f docker-compose.prod.yml); MODE="prod" ;;
    --pull)    DO_PULL=true ;;
    --rebuild) NO_CACHE=true ;;
    --down)    ACTION="down" ;;
    --logs)    ACTION="logs" ;;
    -h|--help)
      sed -n '2,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "未知参数：$arg（使用 --help 查看用法）" >&2; exit 2 ;;
  esac
done

# ── 颜色输出 ────────────────────────────────────────────────
c_ok()   { printf "\033[32m%s\033[0m\n" "$*"; }
c_warn() { printf "\033[33m%s\033[0m\n" "$*"; }
c_err()  { printf "\033[31m%s\033[0m\n" "$*" >&2; }
step()   { printf "\n\033[36m==> %s\033[0m\n" "$*"; }

# ── 1. 环境检查 ─────────────────────────────────────────────
step "检查 Docker 运行环境"
if ! command -v docker >/dev/null 2>&1; then
  c_err "未检测到 docker，请先安装 Docker Engine / Docker Desktop："
  c_err "  https://docs.docker.com/get-docker/"
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  c_err "未检测到 docker compose v2（docker compose version 失败）。"
  c_err "请升级 Docker 到 20.10.13+ 或单独安装 compose 插件。"
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  c_err "Docker 守护进程未运行，请先启动 Docker 后重试。"
  exit 1
fi
c_ok "docker $(docker version --format '{{.Server.Version}}' 2>/dev/null || echo '?') / $(docker compose version --short)"

# ── 快捷子命令 ──────────────────────────────────────────────
if [ "$ACTION" = "down" ]; then
  step "停止并移除服务（数据卷保留）"
  docker compose "${COMPOSE_FILES[@]}" down
  c_ok "已停止。如需连数据一起删除：docker compose down -v"
  exit 0
fi
if [ "$ACTION" = "logs" ]; then
  docker compose "${COMPOSE_FILES[@]}" logs -f --tail=200
  exit 0
fi

# ── 2. 环境变量 ─────────────────────────────────────────────
step "准备环境变量 .env"
gen_secret() {
  # 优先 openssl，其次 python，最后 /dev/urandom
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 32 | tr -d '\n=' | tr '+/' '-_'
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c "import secrets,base64;print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip('='))"
  else
    head -c 48 /dev/urandom | base64 | tr -d '\n=' | tr '+/' '-_'
  fi
}
gen_key32() {
  # AES-256-GCM 主密钥：URL-safe Base64 的 32 字节
  if command -v python3 >/dev/null 2>&1; then
    python3 -c "import secrets,base64;print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"
  else
    openssl rand -base64 32 | tr '+/' '-_'
  fi
}

if [ ! -f .env ]; then
  if [ ! -f .env.example ]; then
    c_err "缺少 .env.example，无法生成 .env"
    exit 1
  fi
  cp .env.example .env
  POSTGRES_PASSWORD_GEN="$(gen_secret)"
  REDIS_PASSWORD_GEN="$(gen_secret)"
  JWT_SECRET_GEN="$(gen_secret)"
  ENC_KEY_GEN="$(gen_key32)"
  # 前端侧数据密钥：web 容器以 NODE_ENV=production 运行，缺失此项会直接抛错拒绝服务
  FINOS_DATA_KEY_GEN="$(gen_secret)"

  # 就地替换占位符（BSD/GNU sed 均兼容：写 .bak 再删除）
  sed -i.bak \
    -e "s|CHANGE_ME_POSTGRES_PASSWORD|${POSTGRES_PASSWORD_GEN}|g" \
    -e "s|CHANGE_ME_REDIS_PASSWORD|${REDIS_PASSWORD_GEN}|g" \
    -e "s|CHANGE_ME_JWT_SECRET_AT_LEAST_32_BYTES_LONG|${JWT_SECRET_GEN}|g" \
    -e "s|CHANGE_ME_BASE64_32BYTES_ENCRYPTION_KEY|${ENC_KEY_GEN}|g" \
    -e "s|CHANGE_ME_FINOS_DATA_KEY|${FINOS_DATA_KEY_GEN}|g" .env
  rm -f .env.bak
  chmod 600 .env 2>/dev/null || true
  c_ok "已生成 .env，并自动填入随机密钥（数据库 / Redis / JWT / AES 主密钥 / 前端数据密钥）"
  c_warn "请妥善备份 .env —— 丢失 ENCRYPTION_MASTER_KEY 将无法解密已存储的 API Key。"
else
  c_ok ".env 已存在，沿用现有配置"
fi

# 生产模式的证书前置检查
if [ "$MODE" = "prod" ]; then
  if [ ! -f deploy/nginx/certs/fullchain.pem ] || [ ! -f deploy/nginx/certs/privkey.pem ]; then
    c_err "生产模式需要 TLS 证书："
    c_err "  deploy/nginx/certs/fullchain.pem"
    c_err "  deploy/nginx/certs/privkey.pem"
    c_err "自签测试证书可执行："
    c_err "  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \\"
    c_err "    -keyout deploy/nginx/certs/privkey.pem \\"
    c_err "    -out deploy/nginx/certs/fullchain.pem -subj \"/CN=localhost\""
    exit 1
  fi
  c_ok "已检测到 TLS 证书"
fi

# ── 3. 拉取代码 ─────────────────────────────────────────────
if [ "$DO_PULL" = true ]; then
  step "拉取最新代码"
  if [ -d .git ]; then
    git pull --ff-only && c_ok "代码已更新" || c_warn "git pull 未成功，继续使用当前代码"
  else
    c_warn "当前目录不是 git 仓库，跳过拉取"
  fi
fi

# ── 4. 构建镜像 ─────────────────────────────────────────────
step "构建镜像（首次构建约 3-8 分钟）"
if [ "$NO_CACHE" = true ]; then
  docker compose "${COMPOSE_FILES[@]}" build --no-cache
else
  docker compose "${COMPOSE_FILES[@]}" build
fi
c_ok "镜像构建完成"

# ── 5. 启动服务 ─────────────────────────────────────────────
step "启动服务"
docker compose "${COMPOSE_FILES[@]}" up -d
c_ok "容器已创建"

# ── 6. 健康检查 ─────────────────────────────────────────────
step "等待服务健康检查通过（最长 180 秒）"
SERVICES=(db redis api web nginx)
DEADLINE=$(( $(date +%s) + 180 ))
while :; do
  ALL_OK=true
  STATUS_LINE=""
  for svc in "${SERVICES[@]}"; do
    cid="$(docker compose "${COMPOSE_FILES[@]}" ps -q "$svc" 2>/dev/null || true)"
    if [ -z "$cid" ]; then
      ALL_OK=false; STATUS_LINE+="$svc=missing "; continue
    fi
    state="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || echo unknown)"
    STATUS_LINE+="$svc=$state "
    [ "$state" = "healthy" ] || [ "$state" = "running" ] || ALL_OK=false
  done
  printf "\r  %s" "$STATUS_LINE"
  if [ "$ALL_OK" = true ]; then printf "\n"; c_ok "全部服务已就绪"; break; fi
  if [ "$(date +%s)" -ge "$DEADLINE" ]; then
    printf "\n"
    c_err "健康检查超时。最近日志："
    docker compose "${COMPOSE_FILES[@]}" logs --tail=40 api web nginx || true
    exit 1
  fi
  sleep 3
done

# ── 7. 端到端探活 ───────────────────────────────────────────
step "验证访问入口"
HTTP_PORT_VAL="$(grep -E '^HTTP_PORT=' .env 2>/dev/null | cut -d= -f2 || true)"
HTTP_PORT_VAL="${HTTP_PORT_VAL:-80}"
BASE="http://localhost:${HTTP_PORT_VAL}"

if command -v curl >/dev/null 2>&1; then
  if curl -fsS "${BASE}/api/health" >/dev/null 2>&1; then
    c_ok "后端 API   ${BASE}/api/health"
  else
    c_warn "后端 API 探活未通过，可执行 docker compose logs api 排查"
  fi
  if curl -fsS -o /dev/null -w '%{http_code}' "${BASE}/login" 2>/dev/null | grep -qE '^(200|307|308)$'; then
    c_ok "前端页面   ${BASE}/login"
  else
    c_warn "前端探活未通过，可执行 docker compose logs web 排查"
  fi
fi

step "部署完成"
echo "  访问地址： ${BASE}"
echo "  健康检查： ${BASE}/api/health"
echo "  查看状态： docker compose ps"
echo "  查看日志： bash deploy.sh --logs"
echo "  停止服务： bash deploy.sh --down"
[ "$MODE" = "prod" ] && echo "  HTTPS 入口： https://<your-domain>"
exit 0
