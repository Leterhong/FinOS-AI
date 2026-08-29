> ⚠️ **本文档撰写于 1.x 个人财富版时期（2026-08-01 前后），部分内容与 2.0 企业版不一致，仅供历史参考；请以 README 与 docs/security.md 为准。**

# 开发指南 · Development Guide

> 面向贡献者的开发规范、工作流与踩坑记录。

## 1. 环境准备

| 依赖 | 版本要求 |
|---|---|
| Node.js | ≥ 20（推荐 22 LTS） |
| Python | ≥ 3.11（推荐 3.13） |
| Git | ≥ 2.40 |

```bash
git clone <repo-url> finos-ai
cd finos-ai

# 前端依赖
npm install

# 后端依赖
python -m venv .venv
source .venv/Scripts/activate     # Windows Git Bash
pip install -r backend/requirements.txt

# 环境变量
cp .env.example .env.local        # 前端
cp .env.example backend/.env      # 后端
```

至少设置 `JWT_SECRET` 与 `ENCRYPTION_MASTER_KEY`（生成方式见 [deployment.md](./deployment.md#32-生成安全密钥)）。

## 2. 启动开发环境

### 2.1 后端

```bash
PYTHONPATH=. python -m uvicorn backend.main:app --port 8300 --reload
```

> **必须用点号模块路径** `backend.main:app`。写成 `backend/main:app` 会报 `Could not import module`。
>
> Git Bash 下 `PYTHONPATH` 有时不生效，可改用稳健启动器：
> ```bash
> PYTHONPATH=. python scripts/run_backend_local.py
> ```

### 2.2 前端

```bash
npm run dev
```

访问 `http://localhost:3000`，Swagger 文档在 `http://localhost:8300/docs`。

### 2.3 端口约定

| 服务 | 端口 |
|---|---|
| Next.js dev | 3000（占用时自动递增） |
| FastAPI | 8300 |
| PostgreSQL（Docker） | 5432 |
| Redis（Docker） | 6379 |

**确保后端 `CORS_ORIGINS` 包含前端实际 origin**，否则登录请求被拦截。

## 3. 代码规范

### 3.1 前端

| 项 | 规范 |
|---|---|
| 语言 | TypeScript strict 模式，禁用 `any`（必要时用 `unknown` + 类型收窄） |
| 组件 | 函数组件 + Hooks，禁用 class 组件 |
| 状态 | 客户端状态用 Zustand，服务端状态用 React Query |
| 样式 | Tailwind 原子类，避免行内 style |
| 数据获取 | **必须**经 `src/lib/backend-client.ts` 的 `backendApi`，禁止直接 `fetch` 后端 |
| 空值处理 | 所有 `.map()` 前加 `?? []`，防止后端字段缺失导致崩溃 |
| 鉴权守卫 | 所有 React Query hooks 加 `enabled: hasBackendToken()` |

### 3.2 后端

| 项 | 规范 |
|---|---|
| 类型标注 | 全量类型标注，SQLAlchemy 用 `Mapped` / `mapped_column` |
| 响应 | 统一用 `backend/core/response.py` 的 `ok()` / `fail()` |
| 查询隔离 | **所有**查询强制携带 `user_id` 过滤 |
| 异步 | LLM 网关全 async；同步上下文调用参考 `_run_generate` 模式 |
| 异常 | 业务错误抛 `HTTPException`，不要自己构造 JSON |
| 敏感字段 | 金额/路径/原文使用 `EncryptedFloat` / `EncryptedString` |

### 3.3 UI 设计约束

| 约束 | 说明 |
|---|---|
| 主色 | 品牌绿 `#00D68F` |
| **禁用紫色** | 全站不得出现紫色系配色 |
| **禁用游戏化元素** | 不使用漂浮大光球、夸张粒子等装饰 |
| **涨红跌绿** | 遵循中国市场习惯：上涨红色、下跌绿色（统一用 `updownClass` 工具函数） |
| 货币符号 | 默认 `¥` |
| 无障碍 | 遮罩层关闭用 `<div aria-hidden onClick>`，**不要**用 `<button aria-hidden tabIndex={-1}>` |

### 3.4 文案规范

| 场景 | 规范 |
|---|---|
| 安全表述 | **禁用**「绝对安全」「百分百安全」「完全安全」 |
| 免责声明 | 涉及财务建议的页面必须包含：「FinOS AI提供信息分析和辅助决策，不构成投资建议。」 |
| 新用户空态 | 显示「欢迎创建你的财富数字分身」引导，而非空数组或报错 |

## 4. 新增功能工作流

### 4.1 新增后端模块

1. 创建 `backend/<module>/`：`__init__.py`、`models.py`、`router.py`、`service.py`
2. 在 `backend/database/session.py::init_db()` 追加模型导入：
   ```python
   from backend.<module> import models as _mod  # noqa: F401
   ```
3. 在 `backend/main.py` 底部导入 router 并加入注册元组：
   ```python
   from backend.<module>.router import router as mod_router  # noqa: E402

   for r in (..., mod_router):
       app.include_router(r, prefix=settings.api_prefix)
   ```
4. 重启后端（uvicorn 的 `--reload` 对新模块导入不总是可靠，建议手动重启）

### 4.2 扩展已有数据表 ⚠️

本项目开发环境**不用 Alembic**，靠 `init_db()` 的 `create_all` 建表。但：

> **`create_all` 不会给已存在的表添加新列。**

给已有模型加字段后，老库运行会直接抛 `OperationalError: no such column`。**必须**在 `init_db()` 末尾添加幂等补列自愈：

```python
def _ensure_xxx_columns(engine) -> None:
    insp = inspect(engine)
    if "xxx" not in insp.get_table_names():
        return
    existing = {c["name"] for c in insp.get_columns("xxx")}
    required = {
        "new_field": "VARCHAR(50) DEFAULT ''",
        "another": "INTEGER DEFAULT 0",
    }
    with engine.begin() as conn:
        for col, ddl in required.items():
            if col not in existing:
                conn.execute(text(f"ALTER TABLE xxx ADD COLUMN {col} {ddl}"))
```

参考实现：`_ensure_ai_usage_logs_columns`。

### 4.3 新增前端页面

1. 在 `src/app/(dashboard)/<route>/page.tsx` 创建页面
2. 在 `src/components/dashboard/Sidebar.tsx` 的 `navItems` 添加导航项
3. 在 `src/hooks/use-backend.ts` 添加对应 React Query hooks（记得 `enabled: hasBackendToken()`）
4. 在 `src/types/` 添加类型定义（**以后端真实响应为准**，不要凭想象写）

### 4.4 新增 AI Agent

见 [ai-agent.md 第 4.6 节](./ai-agent.md#46-扩展新-agent)。

## 5. 测试

```bash
# 后端测试
pytest tests/backend -v

# 覆盖率
pytest tests/backend --cov=backend --cov-report=term-missing

# 前端类型检查
npx tsc --noEmit

# 前端 Lint
npm run lint
```

测试体系说明见 [../tests/README.md](../tests/README.md)。

### 5.1 编写后端测试

测试使用独立的内存 SQLite，通过 `conftest.py` 的 fixture 注入：

```python
def test_user_isolation(client, user_a_token, user_b_token):
    # A 创建资产
    r = client.post("/api/financial/assets",
                    headers={"Authorization": f"Bearer {user_a_token}"},
                    json={"type": "deposit", "name": "A的存款", "amount": 10000})
    asset_id = r.json()["data"]["id"]

    # B 尝试删除 A 的资产 → 必须 404
    r = client.delete(f"/api/financial/assets/{asset_id}",
                      headers={"Authorization": f"Bearer {user_b_token}"})
    assert r.status_code == 404
```

**每个新增的业务端点都应有对应的用户隔离测试。**

## 6. Git 工作流

### 6.1 分支策略

| 分支 | 用途 |
|---|---|
| `main` | 稳定分支，始终可部署 |
| `feat/<name>` | 新功能 |
| `fix/<name>` | Bug 修复 |
| `docs/<name>` | 文档 |
| `refactor/<name>` | 重构 |

### 6.2 Commit 规范

采用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
<type>(<scope>): <subject>

[optional body]
```

**type 取值**：

| type | 用途 |
|---|---|
| `feat` | 新功能 |
| `fix` | Bug 修复 |
| `docs` | 文档变更 |
| `style` | 格式调整（不影响逻辑） |
| `refactor` | 重构（非新功能非修复） |
| `perf` | 性能优化 |
| `test` | 测试相关 |
| `build` | 构建系统或依赖变更 |
| `ci` | CI 配置 |
| `chore` | 杂项 |

**scope 建议**：`frontend`、`backend`、`auth`、`financial`、`ai`、`agents`、`intelligence`、`autonomous`、`personal-os`、`security`、`docs`、`deploy`

**示例**：

```
feat(agents): 新增税务优化 Agent

支持工资薪金个税估算与专项附加扣除识别，
无 LLM 时降级为确定性税率表计算。

fix(auth): 修复 HTTP 部署下 session cookie 无法写入

secure 标志改为由 isSecureContext(req) 动态判断，
不再写死 NODE_ENV === "production"。

docs(api): 补全 autonomous 模块 46 个端点说明
```

### 6.3 提交前检查

```bash
npx tsc --noEmit && npm run lint && pytest tests/backend -q
```

确认无新增错误再提交。

### 6.4 禁止提交的内容

`.gitignore` 已覆盖，但请再次确认**绝不提交**：

- `.env` / `backend/.env`（任何真实密钥）
- `backend/data/`（数据库与用户上传文件）
- `*.db` / `*.sqlite`
- `node_modules/` / `.next/` / `__pycache__/`
- 日志文件、临时调试产物

## 7. 已知踩坑（血泪记录）

### 7.1 后端

| 坑 | 现象 | 解决 |
|---|---|---|
| 斜杠模块路径 | `Could not import module "backend/main"` | 用点号 `backend.main:app` |
| 漏写 `/api` | 接口 404 | 所有路由都在 `/api` 前缀下 |
| 扩展表未补列 | `no such column` | 加幂等补列自愈逻辑 |
| uvicorn 热重载不可靠 | 改代码不生效 | 手动重启后端 |
| async 网关在同步上下文调用 | `RuntimeError: no running event loop` 或死锁 | 用 `_run_generate` 线程池模式 |

### 7.2 前端

| 坑 | 现象 | 解决 |
|---|---|---|
| cookie `secure` 写死 | 登录后反复弹回 `/login` | 用 `isSecureContext(req)` 动态判断 |
| CORS 未放行 | 登录 fetch 被拦截，拿不到 token | 后端 `CORS_ORIGINS` 加上前端 origin |
| 双 dev 实例 | 路由随机 404 | 严禁同时跑两个 `npm run dev`，争抢 `.next` |
| 类型与真实响应不符 | 运行时崩溃 | 以后端真实响应为准修类型，`.map` 前加 `?? []` |
| `aria-hidden` 用在 button | 无障碍告警 | 遮罩用 `<div aria-hidden onClick>` |
| 头像渲染崩溃 | 非 data URI 导致报错 | 渲染前判断 `avatarUrl?.startsWith("data:")` |

### 7.3 构建

| 坑 | 现象 | 解决 |
|---|---|---|
| webpack runtime 损坏 | `TypeError: a[d] is not a function` | 删 `.next` 干净重建 |
| 内存不足 | 构建 OOM | `NODE_OPTIONS="--max-old-space-size=4096"` |
| Windows 删 `.next` 被拦截 | safe-delete 钩子阻止 | 用 `Move-Item .next .next_stale` 重命名绕过 |
| C 盘空间不足 | `ENOSPC` | 指定 `TEMP` / `npm_config_cache` 到其他盘 |

### 7.4 Windows 特有

- `alembic.ini` 中禁止写中文注释（编码问题）
- Git Bash 下 `PYTHONPATH` 可能不生效，用编程式启动脚本
- 路径含空格时必须加引号：`cd "F:/FinOS AI"`

## 8. 项目结构速查

```
finos-ai/
├── src/                    前端源码（Next.js 根目录布局）
│   ├── app/(dashboard)/    受保护页面（25 个路由）
│   ├── components/         UI 组件
│   ├── hooks/              React Query hooks
│   ├── lib/backend-client.ts   唯一后端通道
│   ├── store/              Zustand
│   └── auth/session.ts     服务端 session
├── backend/                后端源码（20+ 模块）
│   ├── main.py             入口 + 路由注册
│   ├── core/response.py    统一响应信封
│   ├── database/session.py init_db + 补列自愈
│   └── security/types.py   加密字段类型
├── docs/                   技术文档（7 篇 + 截图）
├── tests/                  测试（backend / frontend / ai）
├── deploy/                 Docker / Nginx / 监控
└── scripts/                运维与验收脚本
```

## 9. 贡献流程

1. Fork 并创建特性分支：`git checkout -b feat/my-feature`
2. 开发并确保 `tsc` / `lint` / `pytest` 全绿
3. 按 Conventional Commits 规范提交
4. 推送并发起 Pull Request，说明变更动机与影响范围
5. 确认没有引入以下内容（**项目定位红线**）：
   - 商业套餐 / 付费墙 / 订阅分层
   - 支付集成 / Billing 系统
   - 任何形式的用户收费功能

FinOS AI 是**开源的个人财富 OS**，不做商业化收费功能。

---

**免责声明**：FinOS AI 提供信息分析和辅助决策，不构成投资建议。
