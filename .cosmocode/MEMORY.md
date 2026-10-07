# 用户指令记忆

本文件记录了用户的指令、偏好和教导，用于在未来的交互中提供参考。

## 格式

### 用户指令条目
用户指令条目应遵循以下格式：

[用户指令摘要]
- Date: [YYYY-MM-DD]
- Context: [提及的场景或时间]
- Instructions:
  - [用户教导或指示的内容，逐行描述]

### 项目知识条目
Agent 在任务执行过程中发现的条目应遵循以下格式：

[项目知识摘要]
- Date: [YYYY-MM-DD]
- Context: Agent 在执行 [具体任务描述] 时发现
- Category: [运维部署|构建方法|测试方法|排错调试|工作流协作|环境配置]
- Instructions:
  - [具体的知识点，逐行描述]

## 去重策略
- 添加新条目前，检查是否存在相似或相同的指令
- 若发现重复，跳过新条目或与已有条目合并
- 合并时，更新上下文或日期信息
- 这有助于避免冗余条目，保持记忆文件整洁

## 条目

[生产启动与限流配置]
- Date: 2026-10-04
- Context: Agent 在执行文档与截图批次任务、需要重启服务时发现
- Category: 运维部署
- Instructions:
  - 生产模式预览通过仓库根目录 `./start.sh` 启动（Web 3000 / API 8300），停止使用 `./stop.sh`。
  - 修改前端或后端代码后，需先 `./stop.sh` 再 `./start.sh` 才会生效，服务就绪约 120 秒，需等待后再访问。
  - 限流配置的后端字段名为 `api_rate_limit_per_minute` / `auth_rate_limit_per_minute` / `bootstrap_rate_limit_per_minute` / `ai_rate_limit_per_minute`（见 `backend/config/settings.py`），对应环境变量为同名的全大写形式：`API_RATE_LIMIT_PER_MINUTE` / `AUTH_RATE_LIMIT_PER_MINUTE` / `BOOTSTRAP_RATE_LIMIT_PER_MINUTE` / `AI_RATE_LIMIT_PER_MINUTE`。默认 auth 为 10、bootstrap 为 60、api 为 300、ai 为 30（次/分钟/IP）。
  - `POST /api/auth/bootstrap` 每次整页加载都会被前端静默调用，使用独立的 `bootstrap` 限流桶，不要并入登录的严格限流（否则正常刷新约 10 次即 429）。
  - 注意：仓库中不存在 `api_in_in` / `auth_in_in` / `ai_in_in` 这类字段名或环境变量，使用它们不会生效。

[本地开发与部署前置]
- Date: 2026-10-04
- Context: Agent 在验证 Linux / macOS / Docker 部署文档可运行性时发现
- Category: 环境配置 / 排错调试
- Instructions:
  - 系统通常只提供 `python3`（没有 `python`），Python 命令统一使用 `python3 -m venv .venv`；激活虚拟环境后其中的 `python` / `pip` 才指向该环境。
  - Debian / Ubuntu 缺少 venv 模块时 `python3 -m venv` 会报 `ensurepip is not available`，需先 `sudo apt install -y python3 python3-venv python3-pip`。
  - 后端本地开发未配置密钥时会主动拒绝启动（`JWT_SECRET 未配置或强度不足`）；可用 `ENV=development python -m uvicorn backend.main:app ...` 启动临时随机密钥，需要稳定密钥时在 `backend/.env` 设置 `JWT_SECRET` 与 `ENCRYPTION_MASTER_KEY`。
  - Docker 部署不要用 `cp .env.example .env && docker compose up`（占位值会被弱密钥守卫拒绝导致 api 不健康），应使用 `bash deploy.sh` 自动生成全部随机密钥。
  - Docker 生产编排是覆盖层，需 `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` 或等价的 `bash deploy.sh --prod`。
  - 前端内置 fallback rewrite，本地 `npm run dev` 会把 `/api/*` 代理到 `http://127.0.0.1:8300`，无需设置 `NEXT_PUBLIC_BACKEND_URL`。
