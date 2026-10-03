# 部署指南 · Deployment

> 本文档覆盖 FinOS AI 的三种部署方式：本地开发、Docker 一键部署、生产环境部署（含 HTTPS）。

## 1. 部署架构

```
                    ┌─────────────────────────┐
     用户浏览器  ───▶│  nginx  (80 / 443)      │
                    │  反向代理 + 静态资源     │
                    └───────┬─────────┬───────┘
                            │         │
                  /  /_next │         │ /api
                            ▼         ▼
                  ┌──────────────┐  ┌──────────────┐
                  │  web         │  │  api         │
                  │  Next.js 15  │  │  FastAPI     │
                  │  :3000       │  │  :8300       │
                  └──────────────┘  └──────┬───────┘
                                           │
                            ┌──────────────┴──────────────┐
                            ▼                             ▼
                  ┌──────────────────┐        ┌──────────────────┐
                  │  db              │        │  redis           │
                  │  PostgreSQL 16   │        │  Redis 7         │
                  │  持久卷           │        │  AOF 持久化       │
                  └──────────────────┘        └──────────────────┘
```

所有服务均配置 `healthcheck`，依赖方以 `service_healthy` 条件启动，避免竞态。

## 2. 环境要求

| 部署方式 | 要求 |
|---|---|
| 本地开发 | Node.js ≥ 20、Python ≥ 3.11 |
| Docker | Docker ≥ 24、Docker Compose V2 |
| 生产 | 2 vCPU / 4GB RAM 起，Linux（Ubuntu 22.04+ 推荐） |

Python 环境准备：

- Linux（Debian / Ubuntu）：`sudo apt update && sudo apt install -y python3 python3-venv python3-pip`
- macOS：`brew install node python@3.11`
- Windows：从 <https://www.python.org/downloads/> 安装 Python 3.11+，并勾选「Add python.exe to PATH」

系统通常只提供 `python3` 命令，本文档统一使用 `python3 -m venv`。虚拟环境激活后，其中的 `python` 与 `pip` 即指向该环境。

## 3. 环境变量

复制模板并按需修改：

```bash
cp .env.example .env
```

### 3.1 完整变量清单

| 变量 | 说明 | 默认值 | 生产必改 |
|---|---|---|---|
| **端口** | | | |
| `HTTP_PORT` | Nginx 对外端口 | `80` | 否 |
| `WEB_PORT` | 前端容器端口 | `3000` | 否 |
| `API_PORT` | 后端容器端口 | `8300` | 否 |
| **应用** | | | |
| `APP_NAME` | 应用名称 | `FinOS AI Backend` | 否 |
| `DEBUG` | 调试模式 | `false` | **必须 false** |
| `CORS_ORIGINS` | 允许的前端来源（逗号分隔） | `http://localhost:3000,...` | **是** |
| **数据库** | | | |
| `POSTGRES_USER` | PostgreSQL 用户 | `finos` | 建议改 |
| `POSTGRES_PASSWORD` | PostgreSQL 密码 | `finos_dev_password` | **必改** |
| `POSTGRES_DB` | 数据库名 | `finos` | 否 |
| **缓存** | | | |
| `REDIS_PASSWORD` | Redis 密码 | `finos_dev_redis` | **必改** |
| **认证** | | | |
| `JWT_SECRET` | JWT 签名密钥 | 无默认（示例为占位值，弱密钥守卫会拒绝启动） | **必改** |
| `JWT_ALGORITHM` | 签名算法 | `HS256` | 否 |
| `JWT_EXPIRE_MINUTES` | Access Token 有效期（分钟） | `15` | 否（短期令牌 + Refresh 静默续期） |
| `JWT_REFRESH_EXPIRE_DAYS` | Refresh Token 有效期（天） | `30` | 否 |
| **加密** | | | |
| `ENCRYPTION_MASTER_KEY` | AES-256-GCM 主密钥 | 空 | **必设** |
| **限流** | | | |
| `API_RATE_LIMIT_PER_MINUTE` | 普通接口限流 | `300` | 否 |
| `AI_RATE_LIMIT_PER_MINUTE` | AI 接口限流 | `30` | 否 |
| `AI_MAX_TOKENS` | 单次生成最大 token | `8192` | 否 |
| `AI_MAX_INPUT_CHARS` | 单次输入最大字符 | `100000` | 否 |
| **前端** | | | |
| `NEXT_PUBLIC_BACKEND_URL` | 前端访问后端的地址 | 空（同源 `/api`，经 nginx 转发） | 否 |
| **运维** | | | |
| `BACKUP_API_KEY` | 整库备份接口密钥 | 空 | **必设** |
| `MIGRATE_LEGACY_DATA` | 启动期迁移历史数据 | `false` | 否 |

### 3.2 生成安全密钥

```bash
# JWT_SECRET（64 字符随机串）
openssl rand -hex 32

# ENCRYPTION_MASTER_KEY（URL-safe Base64 编码的 32 字节）
python3 -c "import base64,os;print(base64.urlsafe_b64encode(os.urandom(32)).decode())"

# BACKUP_API_KEY
openssl rand -hex 24
```

> ⚠️ **`ENCRYPTION_MASTER_KEY` 一旦丢失，所有已加密的金额、路径、原文将永久不可恢复。** 请务必离线备份。

## 4. 本地开发部署

### 4.1 后端

```bash
# 进入仓库根目录（克隆后的 FinOS-AI 目录）
cd FinOS-AI

# 创建虚拟环境（系统通常只提供 python3）
python3 -m venv .venv

# macOS / Linux
source .venv/bin/activate
# Windows PowerShell
# .\.venv\Scripts\Activate.ps1
# Windows Git Bash
# source .venv/Scripts/activate

pip install -r backend/requirements.txt

# 本地开发：使用开发模式启动，自动生成临时随机密钥
ENV=development python -m uvicorn backend.main:app --host 127.0.0.1 --port 8300 --reload
```

若需要稳定密钥（重启后仍能解密已保存数据）：

```bash
cp .env.example backend/.env
# 编辑 backend/.env，至少设置 JWT_SECRET 与 ENCRYPTION_MASTER_KEY
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8300 --reload
```

> **常见错误**：写成 `backend/main:app`（斜杠）会报 `Could not import module`。Python 模块路径必须用点号。
>
> 也可使用稳健启动器：`PYTHONPATH=. python scripts/run_backend_local.py`

验证：

```bash
curl http://127.0.0.1:8300/api/health
```

### 4.2 前端

```bash
# 在仓库根目录另开一个终端
npm install
npm run dev
```

访问 `http://localhost:3000`。前端内置 fallback rewrite，`/api/*` 会自动代理到 `http://127.0.0.1:8300`，因此本地无需设置 `NEXT_PUBLIC_BACKEND_URL`。

> 仅在前后端分域名部署时才需要复制 `.env.local.example` 为 `.env.local` 并设置 `NEXT_PUBLIC_BACKEND_URL`。此时后端 `CORS_ORIGINS` 必须包含前端实际 origin（含端口），否则跨域请求被拦截。

### 4.3 交互式 API 文档

后端启动后访问 `http://127.0.0.1:8300/docs`（Swagger UI）。

## 5. Docker 一键部署

### 5.1 启动

推荐使用一键脚本，它会自动生成 `.env` 与全部随机密钥，然后构建并启动服务：

```bash
cd FinOS-AI
bash deploy.sh
```

也可以手动执行（必须先把 `.env` 中所有 `CHANGE_ME_*` 替换为真实密钥，否则后端弱密钥守卫会拒绝启动）：

```bash
cp .env.example .env
# 编辑 .env：至少设置 POSTGRES_PASSWORD、REDIS_PASSWORD、JWT_SECRET、ENCRYPTION_MASTER_KEY、FINOS_DATA_KEY

docker compose up -d --build
```

> macOS / Windows 安装 Docker Desktop；Linux 安装 Docker Engine 与 `docker compose` 插件。可用 `HTTP_PORT` 修改对外端口（默认 80）。

服务拓扑与端口：

| 服务 | 容器名 | 镜像/构建 | 端口 |
|---|---|---|---|
| `nginx` | finos-nginx | `deploy/docker/Dockerfile.nginx` | 80 |
| `web` | finos-web | `deploy/docker/Dockerfile.web` | 3000（内部） |
| `api` | finos-api | `deploy/docker/Dockerfile.api` | 8300（内部） |
| `db` | finos-db | `postgres:16-alpine` | 5432（内部） |
| `redis` | finos-redis | `redis:7-alpine` | 6379（内部） |

访问 `http://localhost`。

### 5.2 常用命令

```bash
# 查看服务与健康状态
docker compose ps

# 跟踪后端日志
docker compose logs -f api

# 跟踪前端日志
docker compose logs -f web

# 重启后端
docker compose restart api

# 停止（保留数据卷）
docker compose down

# 停止并删除数据卷（数据丢失）
docker compose down -v
```

### 5.3 数据卷

| 卷名 | 挂载点 | 内容 |
|---|---|---|
| `finos-db-data` | `/var/lib/postgresql/data` | PostgreSQL 数据 |
| `finos-redis-data` | `/data` | Redis AOF 持久化 |
| `finos-api-uploads` | `/app/backend/data/uploads` | 用户上传文件 |

## 6. 生产部署

### 6.1 使用生产编排

生产编排是覆盖层，需要与基础编排叠加使用：

```bash
bash deploy.sh --prod
```

等价于：

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

生产编排相比开发版的差异：

- 关闭源码挂载与热重载
- 前端使用 `next build` 产物 + `next start`
- 资源限制（CPU / 内存上限）
- 日志轮转配置
- 数据库不暴露宿主机端口

### 6.2 启用 HTTPS

1. 将证书放入 `deploy/nginx/certs/`：

```
deploy/nginx/certs/
├── fullchain.pem
└── privkey.pem
```

2. 切换到 TLS 配置：

```bash
# docker-compose.prod.yml 中将 nginx conf.d 挂载指向 conf.d-tls
- ./deploy/nginx/conf.d-tls:/etc/nginx/conf.d:ro
```

3. 重启 Nginx：

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart nginx
```

> **注意**：`src/auth/session.ts` 的 session cookie `secure` 标志由 `isSecureContext(req)` 动态判断（依据 `x-forwarded-proto`），HTTP 环境自动为 `false`，HTTPS 自动为 `true`。**切勿改成写死 `NODE_ENV === "production"`** —— 那会导致 HTTP 部署下浏览器拒收 cookie，用户登录后被反复弹回登录页。

### 6.3 数据库迁移

`api` 容器入口脚本会在启动时自动执行 `alembic upgrade head`，通常无需手动迁移。排查或补跑时使用：

```bash
docker compose exec api alembic -c backend/alembic.ini upgrade head
```

### 6.4 备份与恢复

```bash
# 备份（生成带时间戳的 SQL dump）
bash deploy/scripts/backup.sh

# 恢复
bash deploy/scripts/restore.sh backups/finos_20260801_120000.sql.gz
```

也可通过 API 做逻辑备份：

```bash
curl -H "X-Backup-Key: $BACKUP_API_KEY" \
  http://localhost/api/backup/database -o backup.json
```

### 6.5 一键部署脚本

```bash
bash deploy.sh
```

脚本会依次执行：环境变量校验 → 镜像构建 → 数据库迁移 → 服务启动 → 健康检查。

## 7. 监控

`deploy/monitoring/prometheus.yml` 提供 Prometheus 抓取配置，后端 `/api/metrics` 暴露接口耗时与错误率指标（**不含任何 PII**）。

健康检查端点：

```bash
curl http://localhost/api/health
```

```jsonc
{
  "success": true,
  "data": {
    "status": "ok",
    "service": "FinOS AI Backend",
    "database": { "status": "ok" },
    "redis": { "mode": "redis" },
    "ai_service": { "status": "available" },
    "uptime_seconds": 86400
  }
}
```

Redis 不可用时 `data.redis.mode` 为 `memory`，`data.status` 为 `degraded`，系统自动降级为进程内缓存，**不影响可用性**。

## 8. 故障排查

| 症状 | 原因 | 解决 |
|---|---|---|
| 前端报 `ERR_CONNECTION_REFUSED :8300` | 后端未启动 | Linux/macOS 用 `ss -ltnp \| grep :8300` 或 `lsof -iTCP:8300 -sTCP:LISTEN`，Windows 用 `netstat -ano \| findstr :8300` 确认，重启后端 |
| `python3 -m venv` 报 `ensurepip is not available` | 系统缺少 venv 模块 | Debian/Ubuntu：`sudo apt install -y python3 python3-venv python3-pip` |
| 后端报 `JWT_SECRET 未配置或强度不足，拒绝启动` | 未设置密钥 | 本地用 `ENV=development` 启动，或在 `backend/.env` 设置 `JWT_SECRET` 与 `ENCRYPTION_MASTER_KEY` |
| `docker compose up` 后 api 反复重启、web 一直 waiting | `.env` 仍是 `CHANGE_ME_*` 占位值，后端弱密钥守卫拒绝启动 | 执行 `bash deploy.sh` 自动生成密钥，或手动替换 `.env` 中全部占位值 |
| 登录后反复弹回 `/login` | cookie `secure` 标志错误 或 CORS 未放行 | 检查 `isSecureContext` 逻辑与 `CORS_ORIGINS` |
| `Could not import module "backend/main"` | 用了斜杠路径 | 改为点号 `backend.main:app` |
| `OperationalError: no such column` | 扩展表后未补列 | 在 `init_db()` 添加幂等补列自愈逻辑 |
| 接口 404 | 漏写 `/api` 前缀 | 所有后端路由都在 `/api` 下 |
| `next build` 报 `a[d] is not a function` | webpack 缓存损坏 | 删除 `.next` 后干净重建 |
| Docker 构建 OOM | 内存不足 | 增加 `NODE_OPTIONS=--max-old-space-size=4096` |

---

**免责声明**：FinOS AI 提供信息分析和辅助决策，不构成投资建议。
