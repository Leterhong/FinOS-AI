# FinOS AI — 项目架构与安全攻击面清单（第一阶段交付物）

- 审计对象：`F:\FinOS AI` @ `f61b6dc`（origin/main 最新，BYOM 版）
- 审计日期：2026-11-06
- 审计范围：前端（Next.js 15/React 19）、后端（FastAPI）、数据库（SQLite/PostgreSQL 16）、部署（Docker Compose + nginx）、CI（GitHub Actions）
- 方法：三路并行代码走查（后端 API 面 / 前端与 Next.js 路由 / 配置部署依赖）+ 本地人工核验（main.py、settings.py、依赖扫描）
- 本文档只记录事实清单，不包含漏洞判定（漏洞清单见第二阶段报告）

---

## 1. 技术架构概览

| 层 | 技术 | 入口 |
| --- | --- | --- |
| 前端 | Next.js 15.5.21 (Webpack)、React 19.2.8、TypeScript strict、Tailwind、Zustand 5、Framer Motion | `src/app/(dashboard)/*` 13 个页面 |
| Next.js API | 14 个 Route Handler（Node runtime，force-dynamic） | `src/app/api/**/route.ts` |
| 后端 | FastAPI 0.141、SQLAlchemy 2.0.52、Pydantic v2、Uvicorn（dev 1 worker / compose 2 / prod 4） | `backend/main.py` |
| 数据库 | SQLite（开发降级）/ PostgreSQL 16（生产），SQLAlchemy ORM + Alembic（18 个迁移） | `backend/database/` |
| 缓存 | Redis 7（可选，降级进程内）；Redis Lua 限流 | `backend/core/cache.py` |
| 认证 | 后端 JWT HS256（15min access + 30d refresh HttpOnly Cookie，原子轮换）；前端工作区会话（HMAC-SHA256 签名 Cookie，7 天） | `backend/core/security.py`、`src/auth/` |
| 部署 | Docker Compose（postgres/redis/api/web/nginx），nginx 同源代理 + TLS 叠加层 | `deploy/` |
| CI | GitHub Actions：ci.yml（前端/后端/e2e 三 job）+ codeql.yml；无 pull_request_target | `.github/workflows/` |

关键架构事实：

- **双认证体系**：Next.js 路由用工作区会话 Cookie（`finos_session`，HMAC 签名，7 天，无服务端吊销）；FastAPI 路由用 Bearer JWT（15 分钟，jti 吊销缓存 + refresh 原子轮换）。`/api/workspace/session` 路由是两套体系的桥（可用 `backendToken` 绑定 `acct_*` 身份）。
- **fallback rewrite**（`next.config.ts:62-68`）：未匹配的 `/api/*` 代理到 `${BACKEND_PROXY_URL:-http://127.0.0.1:8300}`，目标仅来自环境变量，非用户可控。
- **遗留模块门控**：`ENABLE_LEGACY_MODULES=1` 时挂载 16 个遗留路由（financial/documents/memory/services/*/intelligence/multimodal/agents/personal-os/autonomous/tasks），默认关闭（`main.py:38`）。测试套件全局开启（`tests/conftest.py:44`）。

## 2. 页面清单（13 页，全部客户端渲染 + 数据级鉴权）

`/`（决策台）、`/cases`、`/documents`、`/risk`、`/rules`、`/workflows`、`/assistant`、`/research`、`/agents`、`/models`、`/governance`、`/guide`（使用指引）、`/deployment`；另有 `/skills`（技能中心）、`/screen`（数据大屏）。

注：`(dashboard)/layout.tsx` 无服务端页面级鉴权——访问控制为数据级（API 401），页面骨架本身公开可渲染。

## 3. Next.js Route Handler 清单（14 个）

全部要求工作区会话 Cookie（除 `/api/workspace/session` 本身）；无 Bearer 校验；无独立限流；无 CSRF Token（依赖 SameSite=Lax）。

| 路由 | 方法 | 认证 | 备注 |
| --- | --- | --- | --- |
| `/api/workspace/session` | POST | 无（引导路由） | 会话签发/绑定；无速率限制；body ≤4KB |
| `/api/models` | GET/POST | 会话 | POST 校验 providerName 白名单 |
| `/api/models/[id]` | PUT/DELETE | 会话 | |
| `/api/models/[id]/default`、`/test` | POST | 会话 | test 会服务端请求用户配置的 baseUrl |
| `/api/models/test` | POST | 会话 | 测试未保存草稿——直接以用户提供的 baseUrl 发起服务端请求（SSRF 面，有 assertSafeBaseUrl 防护） |
| `/api/models/active`、`/usage` | GET | 会话 | |
| `/api/models/playground` | POST | 会话 | 问题 ≤12k 字符；忽略客户端 userId |
| `/api/enterprise/ai` | POST | 会话 | 主 AI 网关；SSE 流式；prompt-guard；600s 超时 |
| `/api/enterprise/ai/document` | POST | 会话 | 文档管线；multipart ≤10MB；扩展名白名单；SSE 分阶段进度 |
| `/api/skills` | GET/PUT/POST/DELETE | 会话 | 自定义技能 CRUD（playbook ≤8000 字符） |
| `/api/skills/import` | POST | 会话 | 技能文件导入 ≤5MB（zip/md/json）；**不落盘**；风险扫描为咨询性非阻断 |
| `/api/account/purge` | POST | 会话 | 删除服务端 `.data` 用户文件（safeId 白名单净化）；无独立确认步骤 |

## 4. FastAPI 后端端点清单（核心 + 遗留）

### 4.1 核心（始终挂载，前缀 /api）

| 路由 | 端点数 | 认证 | 要点 |
| --- | --- | --- | --- |
| `/auth` | 7 | bootstrap/register/login/refresh/logout/csrf 无 Bearer；me 有 | bcrypt；legacy scrypt 登录升级；refresh 原子轮换 + 家族吊销 |
| `/user` | 2 | 有 | |
| `/ai` | 12 | 有 | 模型配置 CRUD（密钥 AES-256-GCM）、generate/stream/embed、会话 |
| `/notifications` | 6 | 有 | |
| `/security` | 3 | 有 | 账户删除需密码 + "DELETE MY DATA" 确认 |
| `/reports` | 7 | 有 | 含 PDF 导出（reportlab，内置中文字体） |
| `/backup` | 2 | export 有 Bearer；**database 无用户认证**（X-Backup-Key + `BACKUP_ALLOW_DATABASE_DUMP=true` 双门，默认全关） | database dump 含全部租户（含密码哈希与密文） |
| `/enterprise` | 14 | 有 | 6 类对象 CRUD + 快照；组织级可见性门控 |
| `/governance` | 17 | 有 | 组织 RBAC（owner/admin/analyst/reviewer/viewer）；邀请确认制；规则版本回放；评测；连接器同步；审计 |
| `/data-sources` | 14 | 有 | 全部固定官方主机（Frankfurter/WorldBank/GLEIF/SEC/Treasury/CNINFO/AKShare），用户输入仅作查询参数 |
| `/health` | 1 | 无 | 503 on DB failure；错误仅入服务端日志 |
| `/metrics`、`/metrics/prometheus` | 2 | X-Metrics-Key（fail-closed） | |

### 4.2 遗留（仅 ENABLE_LEGACY_MODULES=1）

financial(7)、documents(4+analyze 3)、memory(3)、services/agent(3)、cfo(1)、monitor(1)、rag(4)、twin(2)、intelligence(17，其中 `GET /intelligence/events` **无认证**——静态目录)、multimodal(10)、agents(7)、personal-os(21)、autonomous(46)、tasks(2)。合计约 140 端点。

## 5. 数据库清单

- **59 张表**（users、refresh_tokens、ai_model_configs、enterprise_* 6 表、governance_* 4 表、organization_members、project_grants、automation_* 11 表、multimodal_* 2 表、wealth_* 6 表等），18 个 Alembic 迁移。
- 敏感字段加密：模型 API Key、企业对象 storage_path 等使用 AES-256-GCM（`EncryptedString`/`EncryptedFloat` TypeDecorator）。
- Alembic：所有 `drop_table` 均在 `downgrade()`；无 `upgrade()` 中的破坏性操作；运行时审计清理默认关闭（`AUDIT_RETENTION_DAYS=0`）。
- 生产迁移：entrypoint 仅 `alembic upgrade head`，失败即中止（无 create_all 兜底）。

## 6. 危险 Sink 清单（已核验）

| 类别 | 结果 |
| --- | --- |
| 原始 SQL | `backup/router.py:274-277`（表名来自 inspector，非用户输入）、`database/session.py` 启动自愈（硬编码）、`health.py:33 SELECT 1` — **无用户输入可达** |
| subprocess/os.system/eval/exec/pickle/yaml.load | 后端无；`metrics.py:81` Redis EVAL 为固定脚本 |
| 文件 open 变量路径 | multimodal（sanitize + resolve/relative_to 包含检查）、document（UUID 文件名）— 无穿越 |
| 用户可控出站 URL（3 处，全部有 SSRF 防护） | ① 模型 base_url（DNS 解析钉扎 + 私网/元数据拦截，`ai/gateway/provider.py:64-90`）② autonomous webhook（创建校验 + 发送重校验 + 禁重定向）③ governance connector（创建语法检查 + 同步时完整 DNS 公网校验 + 禁重定向 + 5MB 上限） |
| 固定主机出站 | connectors/http_providers.py（6 个官方主机硬编码）、akshare（数据集白名单） |
| zip 解析 | 前端 `src/ai/skills/import.ts`（200 条目/5MB 上限，NUL 拒绝）— 解析 DoS 面，无代码执行 |

## 7. 安全控制现状

| 控制 | 现状 |
| --- | --- |
| 限流 | Redis 滑动窗口（降级 fail-open）：login/register 10/min/IP、bootstrap 60/min/IP、/api/ai/* 30/min/IP、其余 300/min/IP；仅 IP 维度，无用户维度 |
| CSRF | 双提交 + Origin 白名单；Bearer 豁免；**Token 缺失时不失败**（Origin+SameSite 兜底）——弱于严格双提交 |
| Next.js 侧 CSRF/限流 | 无 CSRF Token、无限流；依赖 SameSite=Lax Cookie |
| 安全响应头 | 后端 API：nosniff/DENY/no-referrer/CSP `default-src 'none'`/no-store；前端：nosniff/DENY/COOP/CORP/Permissions-Policy + **CSP Report-Only（unsafe-inline/unsafe-eval）**；nginx TLS 层有 HSTS（HTTP-only 部署无 HSTS） |
| 会话吊销 | 后端 access jti 缓存吊销 + refresh 家族吊销；**前端工作区会话无吊销**（7 天内有效） |
| 密钥管理 | 生产 fail-fast（JWT_SECRET/ENCRYPTION_MASTER_KEY/FINOS_DATA_KEY）；dev 兜底常量公开仓库可见；CI 内联测试密钥 |
| 审计 | governance_audit_logs + 中央 audit_logs 镜像；security_events；保留期默认永久 |

## 8. 已识别的攻击面与初步关注点（进入第二阶段的输入）

以下为清单阶段识别的关注点（**尚未验证、不构成漏洞结论**）：

1. **`/api/auth/bootstrap` 无认证建用户**——每次冷访问创建 guest User 行（60/min/IP 限流），数据库膨胀与孤儿数据面。
2. **前端工作区会话无吊销**——登出/清洗后旧 Cookie 7 天内仍有效。
3. **前端 CSP Report-Only + unsafe-inline/unsafe-eval**——不构成实际拦截。
4. **CORS/CSRF 组合**——非 Bearer 变更请求在无 CSRF Token 时仅靠 Origin 白名单 + SameSite。
5. **`/api/models/test` 草稿测试 SSRF 面**——有 assertSafeBaseUrl 但存在 DNS 重绑定 TOCTOU 窗口（guard 解析后 fetch 再解析）。
6. **技能导入为存储型提示注入通道**——风险扫描咨询性不阻断，playbook 后续注入系统提示。
7. **`/api/backup/database` 全租户导出**——双门控但导出密码哈希与密文；密钥泄露即全量泄露。
8. **entrypoint.sh 启动时 echo DATABASE_URL**——数据库密码进容器日志。
9. **invite token 经 URL 传递**——治理邀请链接含 token（history/referrer 泄露面）。
10. **11 个 Python 依赖无上界 + pytest 进生产镜像**；npm audit 0 已知漏洞。
11. **BYOM 模型 base_url 允许私网地址**（`AI_ALLOW_PRIVATE_ENDPOINTS` dev 自动开启）——部署配置错误即暴露内网。
12. **限流仅按 IP**——共享出口（企业 NAT）下会互相挤兑；无按用户/账号维度限流。
13. **`GET /intelligence/events` 无认证**（遗留门控内，静态目录）。
14. **`tmp-route-head.txt` 调试残留被 git 跟踪**。

## 9. 未覆盖模块声明

- **动态渗透测试**：本阶段仅静态走查 + 本地 API 冒烟；未做模糊测试、并发竞态实测、依赖 CVE 数据库全量比對（npm audit 为 0，Python 侧无 lockfile 可扫）。
- **多模态/遗留 140 端点**：清单已建，深度逻辑审计将在第二阶段按风险优先级抽样。
- **前端构建产物**：未审计 `.next` 产物内容。
- **性能/DoS**：仅记录上限值，未做压测。
