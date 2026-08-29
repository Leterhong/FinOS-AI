> ⚠️ **本文档撰写于 1.x 个人财富版时期（2026-08-01 前后），部分内容与 2.0 企业版不一致，仅供历史参考；请以 README 与 docs/security.md 为准。**

# 系统架构 · Architecture

> FinOS AI —— 开源的个人财富操作系统。本文档描述系统的整体分层、模块边界、数据流与关键设计决策。

## 1. 架构总览

FinOS AI 采用**前后端分离 + 单体后端多模块**的架构。前端是 Next.js 15 App Router 应用，后端是 FastAPI 单体服务（内部按业务域切分为 20+ 独立模块），两者通过统一的 `/api` REST 通道通信。

```
┌───────────────────────────────────────────────────────────────────┐
│                          浏览器 (Client)                           │
│  Next.js 15 App Router · React 19 · Zustand · React Query v5      │
│  ┌──────────┬──────────┬──────────┬──────────┬─────────────────┐  │
│  │ 财富驾驶舱│ 财富实验室│  AI 助手 │ 自动化中心│ 时间线/知识中心  │  │
│  └──────────┴──────────┴──────────┴──────────┴─────────────────┘  │
│                              │                                     │
│              src/lib/backend-client.ts (唯一后端通道)              │
│              自动拼 /api · 注入 JWT · 解响应信封 · 401 清 token     │
└──────────────────────────────┼─────────────────────────────────────┘
                               │ HTTPS / JSON
┌──────────────────────────────▼─────────────────────────────────────┐
│                     FastAPI 后端 (:8300, 前缀 /api)                 │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  中间件层  SecurityMiddleware (CSRF + 限流) → MetricsMiddleware │ │
│  │            → CORSMiddleware → 统一异常处理器                    │ │
│  └───────────────────────────────────────────────────────────────┘ │
│  ┌─────────────┬─────────────┬─────────────┬────────────────────┐  │
│  │  基础域      │  智能域      │  自主域      │  个人 OS 域        │  │
│  │ auth/user   │ intelligence│ autonomous  │ personal_os        │  │
│  │ financial   │ ai/gateway  │ (46 端点)   │ (24 端点)          │  │
│  │ document    │ agents      │ 规则/定时    │ 分身/时间线/知识    │  │
│  │ memory      │ multimodal  │ 工作流/计划  │ 日报/决策/搜索      │  │
│  │ notification│ report      │ 行动中心     │ 隐私中心           │  │
│  └─────────────┴─────────────┴─────────────┴────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │  横切层  security (AES-256-GCM 字段加密 · 审计 · 所有权校验)     │ │
│  │          core (统一响应信封 · 结构化日志 · 健康检查 · 指标)      │ │
│  │          tasks (进程内异步任务 Worker)                          │ │
│  └───────────────────────────────────────────────────────────────┘ │
└──────────────┬──────────────────────────────┬──────────────────────┘
               │ SQLAlchemy 2.0               │ LLM Gateway (async)
    ┌──────────▼──────────┐        ┌──────────▼──────────────────┐
    │  PostgreSQL (生产)   │        │  任意 OpenAI 兼容 LLM 服务   │
    │  SQLite (本地开发)   │        │  用户自带 API Key (加密入库) │
    │  44 张业务表         │        │  失败自动降级为本地确定性算法 │
    └─────────────────────┘        └─────────────────────────────┘
```

## 2. 分层设计

### 2.1 前端层（Next.js 15 App Router）

| 目录 | 职责 |
|---|---|
| `src/app/(dashboard)/` | 所有受保护业务页面（25 个路由） |
| `src/app/login`, `register` | 公开认证页面 |
| `src/lib/backend-client.ts` | **唯一**后端通道，禁止绕过直接 `fetch` 后端 |
| `src/hooks/use-backend.ts` | React Query hooks，统一 `enabled: hasBackendToken()` 守卫 |
| `src/store/` | Zustand 全局状态（auth、UI 偏好） |
| `src/components/` | UI 组件库（dashboard / ui / charts） |
| `src/auth/session.ts` | Next 服务端 session cookie 读写 |
| `middleware.ts` | 路由守卫，校验 `finos_session` cookie |

**关键约束**：前端所有后端请求必须经过 `backendApi`。它负责自动拼接 `/api` 前缀、注入 `Authorization: Bearer <finos_token>`、解开响应信封（`{success, data}` → `data`）、以及在 401 时清除本地 token。

### 2.2 后端层（FastAPI 模块化单体）

后端不是微服务，而是**按业务域强边界切分的单体**。每个模块自带 `models.py`（数据模型）、`router.py`/`api.py`（HTTP 层）、`service.py`（业务逻辑），互相之间只通过函数调用协作，不共享内部状态。

| 域 | 模块 | 端点数 | 说明 |
|---|---|---|---|
| 认证 | `auth`, `user` | 8 | JWT 签发/轮换/吊销、CSRF、用户资料 |
| 财务 | `financial`, `services/financial`, `services/twin` | 14 | 资产、交易、财富画像、Financial Twin |
| 文档 | `document`, `services/document` | 7 | 上传、解析、候选记录确认 |
| AI | `ai`, `services/rag`, `services/cfo` | 17 | 模型配置、生成、流式、向量检索、CFO 分析 |
| 智能 | `intelligence` | 18 | 预测、六维评分、情景模拟、策略、对话 |
| 多模态 | `multimodal` | 10 | 图片/文件/音频/文本统一摄入与识别 |
| Agent | `agents`, `services/agent` | 10 | Agent 市场、工具调用、工作流编排 |
| 报告 | `report` | 6 | 财富报告生成与多格式导出 |
| 个人 OS | `personal_os` | 24 | 财富分身、时间线、知识、日报、全局搜索 |
| 自动化 | `autonomous` | 46 | 规则、定时、工作流、长期计划、行动中心 |
| 安全 | `security`, `backup` | 5 | 审计日志、安全事件、账户注销、数据导出 |
| 运维 | `tasks`, `health`, `metrics`, `notification` | 9 | 异步任务、健康检查、指标、通知 |
| **合计** | | **178** | |

### 2.3 数据层

- **ORM**：SQLAlchemy 2.0 Declarative（`Mapped` / `mapped_column` 风格）
- **主键**：统一 `String(32)`，值为 `uuid4().hex`
- **生产**：PostgreSQL；**开发**：SQLite 自动降级（`backend/data/finos.db`）
- **建表**：开发环境由 `lifespan` 中的 `init_db()` 自动 `create_all`；生产使用 Alembic 迁移
- **无 ORM relationship**：全仓不使用 `relationship()`，表间关联仅靠 `ForeignKey` 列 + 显式查询，避免隐式 N+1 与级联副作用

详见 [database-schema.md](./database-schema.md)。

## 3. 核心数据流

### 3.1 请求生命周期

```
浏览器
  │ backendApi.financial.listAssets()
  ▼
[SecurityMiddleware]  ── CSRF 双提交校验 + 滑动窗口限流
  ▼
[MetricsMiddleware]   ── 记录耗时/状态码（无 PII）
  ▼
[CORSMiddleware]      ── 白名单校验
  ▼
[Depends(get_current_user)] ── 解析 JWT → 加载 User
  ▼
[Router handler]      ── 业务逻辑，查询强制携带 user_id
  ▼
[SQLAlchemy]          ── EncryptedFloat/String 透明解密
  ▼
[ok(data)]            ── {"success": true, "data": ..., "message": ""}
```

### 3.2 Financial Twin（财富数字分身）

Twin 是全系统的**数据中枢**。用户的资产、交易、画像被聚合计算为一个结构化快照，供所有智能模块消费：

```
assets + transactions + financial_profiles
              │
              ▼  services/twin/service.py
       ┌─────────────────┐
       │ Financial Twin  │  净资产 / 现金流 / 风险分 / 健康分 / 目标进度
       └────────┬────────┘
                │ 被以下模块读取
   ┌────────────┼────────────┬──────────────┬─────────────┐
   ▼            ▼            ▼              ▼             ▼
预测引擎     六维评分     Agent 上下文    自动化快照     日报生成
intelligence intelligence   agents        autonomous   personal_os
```

Twin 在资产/交易变更后重算，快照写入 `financial_twins` 表保留历史，用于趋势对比与事件触发。

### 3.3 AI 调用与降级链

```
业务模块请求 AI
      │
      ▼
backend/ai/gateway/provider.py (全 async)
      │
      ├─ 用户已配置模型？ ── 否 ─→ 【本地确定性算法】返回 tier="local"
      │        │ 是
      │        ▼
      ├─ 解密 API Key (Fernet) → 调用 OpenAI 兼容接口
      │        │
      │        ├─ 成功 ─→ 落 ai_usage_logs → 返回 tier="llm"
      │        └─ 失败/超时/预算耗尽 ─→ 【本地确定性算法】tier="local"
      ▼
统一结构化结果
```

**设计原则**：AI 永远是增强项而非依赖项。任何 LLM 不可用的情况下，系统必须仍能返回有意义的确定性结果（`tier="local"`），页面不得白屏或报错。

## 4. 关键设计决策

### 4.1 为什么是模块化单体而非微服务

个人财富 OS 的数据高度耦合（几乎所有模块都要读 Twin），拆微服务会引入大量跨服务查询与分布式事务。模块化单体在保持清晰边界的同时，避免了运维复杂度。单实例即可服务，Docker 一键部署。

### 4.2 用户隔离铁律

**所有**数据库查询必须强制携带 `user_id` 过滤。越权访问一律返回 404（而非 403），不泄露资源是否存在。资源所有权校验统一走 `require_owned_resource()`。新用户零数据时返回引导态「欢迎创建你的财富数字分身」，而不是空数组或报错。

### 4.3 敏感字段透明加密

金额、收支、文件路径、原始文本等敏感字段使用 `EncryptedFloat` / `EncryptedString`（`backend/security/types.py`）——基于 AES-256-GCM 的 SQLAlchemy `TypeDecorator`，在 ORM 读写时透明加解密，业务代码无感知。即使数据库文件泄露，敏感数据仍是密文。

### 4.4 统一响应信封

所有接口返回 `{"success": bool, "data": any, "message"|"error": str}`。前端 `backendApi` 统一解包，业务代码拿到的直接是 `data`。异常处理器保证任何未捕获错误也返回该格式且**绝不暴露堆栈或内部路径**。

### 4.5 无 Alembic 的开发流

本项目开发环境不依赖 Alembic：`init_db()` 通过 `Base.metadata.create_all` 建表。但 `create_all` **不会给已存在的表加列**，因此扩展既有模型时必须在 `init_db()` 末尾添加**幂等补列自愈**逻辑（`inspect(engine)` 比对列 → 缺失则 `ALTER TABLE ADD COLUMN`）。参考 `_ensure_ai_usage_logs_columns` 实现。生产环境使用 Alembic 正式迁移。

## 5. 技术选型

| 层 | 技术 | 版本 | 选型理由 |
|---|---|---|---|
| 前端框架 | Next.js | 15.3 | App Router、Server Components、中间件路由守卫 |
| UI 运行时 | React | 19 | 并发特性、`use` hook |
| 语言 | TypeScript | 5.7 | strict 模式全覆盖 |
| 样式 | Tailwind CSS | 3.4 | 原子化、深色主题一致性 |
| 客户端状态 | Zustand | 5.0 | 轻量、无 Provider 地狱 |
| 服务端状态 | React Query | 5.101 | 缓存、失效、乐观更新 |
| 动效 | Framer Motion | 11.15 | 声明式过渡 |
| 图表 | Recharts | 2.15 | 组合式 API、SVG 输出 |
| 后端框架 | FastAPI | — | 异步原生、自动 OpenAPI |
| ORM | SQLAlchemy | 2.0 | `Mapped` 类型标注、成熟稳定 |
| 数据库 | PostgreSQL / SQLite | — | 生产 PG，开发零配置 SQLite |
| 密码哈希 | bcrypt | — | 自适应成本因子 |
| 字段加密 | AES-256-GCM | — | 认证加密，防篡改 |

## 6. 目录结构

```
FinOS AI/
├── src/                      # Next.js 前端（项目根即前端根）
│   ├── app/                  # App Router 页面
│   │   ├── (dashboard)/      # 受保护业务页面
│   │   ├── login/ register/  # 公开认证页
│   │   └── api/              # Next 侧 BFF 路由（session 桥接等）
│   ├── components/           # UI 组件
│   ├── hooks/                # React Query hooks
│   ├── lib/                  # backend-client 等基础设施
│   ├── store/                # Zustand stores
│   └── auth/                 # 服务端 session 处理
├── backend/                  # FastAPI 后端
│   ├── main.py               # 应用入口 + 路由注册
│   ├── config/               # Pydantic Settings
│   ├── core/                 # 响应信封、日志、健康、指标
│   ├── database/             # Session、Base、init_db
│   ├── security/             # 加密类型、中间件、审计
│   ├── auth/ user/ financial/ ai/ document/ memory/ notification/
│   ├── intelligence/         # Phase 7.1 财富智能引擎
│   ├── multimodal/ agents/ report/   # Phase 7.2 多模态与 Agent 生态
│   ├── personal_os/          # Phase 7.3 个人 OS
│   ├── autonomous/           # Phase 7.4 智能自动化
│   ├── backup/               # Phase 7.6 数据导出
│   └── services/             # 业务服务层（twin/rag/cfo/agent/monitor）
├── docs/                     # 技术文档（本目录）
│   └── screenshots/          # README 功能截图
├── tests/                    # 测试体系
│   ├── backend/  frontend/  ai/
├── deploy/                   # Docker / Nginx / 监控配置
├── scripts/                  # 运维与验收脚本
├── docker-compose.yml        # 开发编排
├── docker-compose.prod.yml   # 生产编排
├── .env.example              # 环境变量模板
├── LICENSE                   # MIT
└── README.md
```

> **说明**：前端代码位于项目根目录（`src/`、`package.json`、`next.config.ts`），这是 Next.js 的标准布局；后端作为 `backend/` 子目录并存。这是经过验证的单前端 monorepo 结构，Docker 构建上下文与部署脚本均基于此布局，不建议改动。

## 7. 扩展指引

### 新增后端模块

1. 创建 `backend/<module>/`，包含 `models.py`、`router.py`、`service.py`、`__init__.py`
2. 在 `backend/database/session.py::init_db()` 中追加 `from backend.<module> import models as _x  # noqa: F401`
3. 在 `backend/main.py` 底部 import router，并加入 `for r in (...)` 注册元组
4. 若扩展已有表结构，必须补充幂等补列自愈逻辑

### 新增 AI Agent

在 `backend/agents/plugins/` 下新建插件类，继承 `BaseAgent`，声明 `name` / `description` / `run()`，注册表会自动发现。详见 [ai-agent.md](./ai-agent.md)。

---

**免责声明**：FinOS AI 提供信息分析和辅助决策，不构成投资建议。
