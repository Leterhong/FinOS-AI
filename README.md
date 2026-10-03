<div align="center">

# FinOS AI

### 面向企业经营与风险研判的开源金融服务 Agent

让企业资料、经营事实、业务规则与外部研究进入同一条可追溯的研判链路，辅助团队完成资料理解、规则匹配、风险提示、投研整理和流程协作。

[![CI](https://github.com/Leterhong/FinOS-AI/actions/workflows/ci.yml/badge.svg)](https://github.com/Leterhong/FinOS-AI/actions/workflows/ci.yml)
[![Release](https://img.shields.io/badge/release-2.2.1-38bdf8.svg)](./CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-22c55e.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](https://www.typescriptlang.org/)
[![Security Policy](https://img.shields.io/badge/security-policy-f59e0b.svg)](./SECURITY.md)

[图文详解](./docs/introduction.md) · [产品能力](#产品能力) · [界面预览](#界面预览) · [快速开始](#快速开始) · [技术架构](#技术架构) · [安全边界](#安全与责任边界)

</div>

---

## FinOS AI 是什么

FinOS AI 是一个面向企业金融、产业金融、授信尽调、经营分析和风险管理场景的开源 Agent 工作台。它将原本散落在文档、表格、制度、研究材料和沟通流程中的信息组织成一条可核验的工作链路：

```text
企业项目
   ↓
资料解析 → 事实抽取 → 规则匹配 → 风险信号
   ↓                         ↓
证据引用 ← 人工核验 ← 研判建议 → 流程任务
```

它不是个人记账软件，也不替代授信、投资、法律、审计或合规负责人。系统的目标是提升资料处理效率和判断透明度，让关键结论能够回答三个问题：

1. 结论基于什么资料和事实？
2. 命中了哪条规则，为什么构成风险？
3. 谁核验过，下一步需要谁处理？

> FinOS AI 提供信息分析与决策辅助，不构成投资、授信、法律、审计或合规意见。

## 当前版本状态

FinOS AI 2.2 已完成企业金融信息架构、可配置模型中心、AI 研判主链路与组织治理控制。开源版本无需登录即可进入零数据工作区，系统不自动创建企业、资产、风险、规则或研究结论，所有业务记录均由用户主动录入或基于真实资料生成。

适用方向：企业经营质量分析与融资材料预审、授信尽调与贷前核验、产业链与供应链金融研究、并购与投融资资料整理、制度规则检索与人工复核、行业政策与企业舆情投研底稿。

无登录模式使用浏览器隔离的访客身份，适合单机评估，不等同于企业身份源或共享设备隔离。组织、成员与项目权限在完整后端模式生效；生产环境仍应接入企业账户生命周期、HTTPS、密钥管理和留存策略。详见 [安全策略](./SECURITY.md) 和 [安全设计](./docs/security.md)。

## 界面预览

FinOS AI 采用深色金融工作台设计，浅色主题达 WCAG AA，移动端完整适配。下面是几个核心界面，完整图文讲解见 [FinOS AI 图文详解](./docs/introduction.md)。

| 经营决策台 | 资料研判 · 事实台账 | 风险中心 · 详情 |
| --- | --- | --- |
| ![经营决策台](./docs/screenshots/guide/01-dashboard.png) | ![资料研判](./docs/screenshots/guide/08-documents-facts.png) | ![风险中心](./docs/screenshots/guide/12-risk-drawer.png) |

| 规则库 · Visual View | 数据大屏 | 浅色主题 |
| --- | --- | --- |
| ![规则库](./docs/screenshots/guide/15-rules-visual.png) | ![数据大屏](./docs/screenshots/guide/29-screen-overview.png) | ![浅色主题](./docs/screenshots/guide/33-light-dashboard.png) |

> 📖 [FinOS AI 图文详解](./docs/introduction.md) 收录 35 张按页面顺序编号的截图，逐页逐功能讲解从「接入模型」到「输出风险清单」的完整链路。

## 产品能力

| 模块 | 解决的问题 |
| --- | --- |
| 经营决策台 | 统一观察项目、资料、风险、任务和 Agent 运行态；Priority Work 面板展示需要人工处理的事项 |
| 项目中心 | 管理企业研判项目、行业、融资需求、负责人和推进阶段；支持 Table/Board 双视图 |
| 资料研判 | 汇集 PDF、Word、Excel、CSV、TXT 和图片，事实台账逐条携带原文引用并支持定位高亮 |
| 风险中心 | 按严重度聚合风险信号，结构化详情抽屉展示 What/Why/Evidence/Rule/Impact/Review/Traceability |
| 投研中心 | 整理行业、政策、企业与舆情材料，沉淀专题研究底稿，支持复制为 Markdown |
| 规则库 | 管理准入、授信、并购、担保和供应链规则；结构化条件 + Visual View 决策链 + 测试样本记录 |
| Agent 中心 | 编排资料理解、规则匹配、风险研判和投研整理 Agent；每条运行可展开执行轨迹 |
| 流程中心 | 研判流程全景（资料→分析→规则→风险→复核→交付）；看板流转 + 超期自动标红 |
| 智能研判助手 | 基于项目上下文回答问题，流式输出；错误自动分类并给出可操作建议 |
| AI 模型中心 | 三步接入向导；服务端加密保存凭据，测试连通性、选择默认模型和任务角色 |
| 企业治理 | 管理组织成员（邀请确认制）、五级角色、项目授权、数据密级、规则历史、复核队列、模型评测、连接器与审计（Who/Action/Object/Result/Details 搜索与抽屉） |
| 使用指引 | 内置 8 步交互指南 + 常见问题 + 快捷键 + 核心价值链可视化（`/guide`） |
| 全局命令面板 | ⌘K/Ctrl+K 搜索项目、资料、风险、页面；建议动作随工作区状态变化 |

> 📖 **首次使用？** 请查看内置 [使用指引](/guide)、[完整使用文档](./docs/user-guide.md) 或 [图文详解](./docs/introduction.md)，按 8 个步骤完成从"上传资料"到"输出风险清单"的完整研判。

## 设计原则

Evidence first · Human in the loop · Explainable rules · Secure by default · Open and self-hosted：重要判断可回溯到原始资料、事实与引用位置，关键决策由授权人员确认，规则命中可解释，密钥不进入前端，MIT 开源可自托管。完整说明见 [图文详解 · FinOS AI 是什么](./docs/introduction.md#1-finos-ai-是什么)。

## 技术架构

浏览器侧 Next.js 15 / React 19 / TypeScript strict / Tailwind CSS / Zustand，经 Route Handlers 承载工作区会话、模型配置、文档解析与 AI 网关；服务端 FastAPI + SQLAlchemy 2，开发用 SQLite、生产用 PostgreSQL 16，Redis 7 可选并可降级。模型凭据以 AES-256-GCM 仅服务端加密，出站访问经 SSRF 防护。文件处理覆盖 `mammoth`（Word）、`pdf-parse`（PDF）、图片视觉 OCR 与 Excel/CSV 表格结构，并保留行号、单元格与图像坐标。

完整分层、数据流与部署拓扑见 [架构文档](./docs/architecture.md)。

## 快速开始

### 只体验前端

要求：Node.js 20+。

```bash
git clone https://github.com/Leterhong/FinOS-AI.git
cd FinOS-AI
npm install
npm run dev
```

打开 <http://localhost:3000>，无需账号，也不会加载任何预置业务数据。生产预览需先复制 `.env.local.example` 为 `.env.local`，并为 `FINOS_AUTH_SECRET` 与 `FINOS_DATA_KEY` 设置两个独立的强随机值；生产模式会拒绝公开的开发兜底密钥。

### 配置 AI 模型

打开 `/models` 选择供应商，填写 API Key、模型名称与可选接口地址，保存后点击「测试连接」，通过即可设为默认模型并选择任务角色。API Key 在工作区会话隔离下于服务端以 AES-256-GCM 加密保存，返回浏览器时只提供掩码；Ollama 或自建兼容服务可使用自定义 Base URL。

### 启动完整本地服务

要求：Python 3.11+。

```bash
python -m venv .venv

# Windows 使用 .\.venv\Scripts\activate
source .venv/bin/activate

pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8300 --reload

# 另一个终端
npm run dev
```

后端健康检查 <http://127.0.0.1:8300/api/health>。Next.js 内置 fallback rewrite，未匹配的 `/api/*` 会自动代理到 `http://127.0.0.1:8300`，无需设置 `NEXT_PUBLIC_BACKEND_URL`，可用 `BACKEND_PROXY_URL` 覆盖。

### Docker Compose

```bash
cp .env.example .env
# 替换所有 CHANGE_ME_* 值后再启动
docker compose up --build -d
```

通过 <http://localhost> 访问，Docker 默认经 nginx 使用同源 `/api` 代理。

## 配置

生产环境至少需要为 `JWT_SECRET`、`ENCRYPTION_MASTER_KEY`、`FINOS_DATA_KEY`、`POSTGRES_PASSWORD`、`REDIS_PASSWORD` 配置强随机值，缺失、过短或使用示例占位值时前后端同一策略拒绝启动。配置模板见 [`.env.example`](./.env.example)（Docker Compose）、[`.env.local.example`](./.env.local.example)（Next.js）与 [`backend/.env.example`](./backend/.env.example)（FastAPI）。

模型密钥不要添加 `NEXT_PUBLIC_` 前缀，该前缀变量会编译进浏览器产物。真实 `.env`、数据库、上传目录、虚拟环境和构建产物均不应提交到 Git。

## 测试与质量门禁

```bash
npm run typecheck       # TypeScript 类型检查
npm test                # 前端契约与安全回归
npm run test:unit       # 规则引擎等纯函数单测
npm run build           # Next.js 生产构建
npm run test:backend    # 后端与 AI 回归（pytest）
node tests/e2e/main-chain.mjs   # 端到端主链路（本地 mock LLM，需先 build）
```

以上门禁同时由 GitHub Actions（CI + CodeQL + Dependabot）自动执行。测试使用隔离数据与本地 mock 模型，不连接任何真实模型服务。更多信息见 [`tests/README.md`](./tests/README.md)。

## 安全与责任边界

- 短期 Access Token 仅驻留前端内存，Refresh Token 使用 HttpOnly Cookie 并以原子吊销实现轮换与重放检测。
- 上传文件分块读取并限制大小；Webhook 与模型 Base URL 拒绝本机、内网、保留地址和自动重定向，仅信任明确配置的反向代理来源。
- 模型凭据以 AES-256-GCM 加密落盘，解密失败时拒绝读写并保留原密文；模型密钥、数据库凭据和企业资料不进入公开仓库或浏览器构建。

FinOS AI 提供应用层组织角色、项目授权、数据分级、复核与审计控制，部署者仍须对接真实身份源，并完成日志留存、备份恢复、模型供应商评估和适用地区的监管合规。完整清单见 [安全策略](./SECURITY.md) 与 [安全设计](./docs/security.md)，模式对比与上线门槛见 [部署模式说明](./docs/deployment-modes.md)。发现漏洞请使用 GitHub 私密漏洞报告，不要创建公开 Issue 或上传真实企业数据。

## 参与贡献

欢迎通过 Issue 讨论产品建议，通过 Pull Request 提交改进。提交前请运行类型检查、测试和生产构建，不提交真实企业资料、个人信息、数据库或任何密钥，对安全问题使用私密报告渠道，并在涉及金融判断时保留证据、解释和人工复核边界。

## License

本项目基于 [MIT License](./LICENSE) 开源。软件按“原样”提供，不构成投资、授信、法律、审计或合规意见。
