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
python -c "import base64,os;print(base64.urlsafe_b64encode(os.urandom(32)).decode())"

# BACKUP_API_KEY
openssl rand -hex 24
```

> ⚠️ **`ENCRYPTION_MASTER_KEY` 一旦丢失，所有已加密的金额、路径、原文将永久不可恢复。** 请务必离线备份。

## 4. 本地开发部署

### 4.1 后端

```bash
cd "F:/FinOS AI"

# 创建虚拟环境
python -m venv .venv
source .venv/Scripts/activate    # Windows Git Bash
# source .venv/bin/activate      # Linux / macOS

pip install -r backend/requirements.txt

# 配置后端环境变量
cp .env.example backend/.env
# 编辑 backend/.env，至少设置 JWT_SECRET 与 ENCRYPTION_MASTER_KEY

# 启动（注意是点号模块路径 backend.main:app）
PYTHONPATH=. python -m uvicorn backend.main:app --port 8300 --reload
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
cd "F:/FinOS AI"
npm install

# 配置前端环境变量
cp .env.example .env.local
# 设置 NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8300

npm run dev
```

访问 `http://localhost:3000`。

> **重要**：本地跨域时，后端 `CORS_ORIGINS` 必须包含前端实际 origin（含端口）。否则登录请求被 CORS 拦截 → 拿不到 token → 被弹回登录页。

### 4.3 交互式 API 文档

后端启动后访问 `http://127.0.0.1:8300/docs`（Swagger UI）。

## 5. Docker 一键部署

### 5.1 启动

```bash
cp .env.example .env
# 编辑 .env 设置密钥

docker compose up -d
```

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
docker compose ps                # 查看服务与健康状态
docker compose logs -f api       # 跟踪后端日志
docker compose logs -f web       # 跟踪前端日志
docker compose restart api       # 重启后端
docker compose down              # 停止（保留数据卷）
docker compose down -v           # 停止并删除数据卷（⚠️ 数据丢失）
```

### 5.3 数据卷

| 卷名 | 挂载点 | 内容 |
|---|---|---|
| `finos-db-data` | `/var/lib/postgresql/data` | PostgreSQL 数据 |
| `finos-redis-data` | `/data` | Redis AOF 持久化 |
| `finos-uploads` | `/app/backend/data/uploads` | 用户上传文件 |

## 6. 生产部署

### 6.1 使用生产编排

```bash
docker compose -f docker-compose.prod.yml up -d
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
docker compose -f docker-compose.prod.yml restart nginx
```

> **注意**：`src/auth/session.ts` 的 session cookie `secure` 标志由 `isSecureContext(req)` 动态判断（依据 `x-forwarded-proto`），HTTP 环境自动为 `false`，HTTPS 自动为 `true`。**切勿改成写死 `NODE_ENV === "production"`** —— 那会导致 HTTP 部署下浏览器拒收 cookie，用户登录后被反复弹回登录页。

### 6.3 数据库迁移

生产环境使用 Alembic：

```bash
docker compose exec api alembic upgrade head
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
    "database": "ok",
    "redis": "ok",
    "ai": "ok",
    "uptime_seconds": 86400
  }
}
```

Redis 不可用时返回 `"redis": "degraded"`，系统自动降级为进程内缓存，**不影响可用性**。

## 8. 故障排查

| 症状 | 原因 | 解决 |
|---|---|---|
| 前端报 `ERR_CONNECTION_REFUSED :8300` | 后端未启动 | `netstat -ano \| grep :8300` 确认，重启后端 |
| 登录后反复弹回 `/login` | cookie `secure` 标志错误 或 CORS 未放行 | 检查 `isSecureContext` 逻辑与 `CORS_ORIGINS` |
| `Could not import module "backend/main"` | 用了斜杠路径 | 改为点号 `backend.main:app` |
| `OperationalError: no such column` | 扩展表后未补列 | 在 `init_db()` 添加幂等补列自愈逻辑 |
| 接口 404 | 漏写 `/api` 前缀 | 所有后端路由都在 `/api` 下 |
| `next build` 报 `a[d] is not a function` | webpack 缓存损坏 | 删除 `.next` 后干净重建 |
| Docker 构建 OOM | 内存不足 | 增加 `NODE_OPTIONS=--max-old-space-size=4096` |

---

**免责声明**：FinOS AI 提供信息分析和辅助决策，不构成投资建议。
