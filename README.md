<div align="center">

# FinOS AI

### 面向企业经营与风险研判的开源金融服务 Agent

让企业资料、经营事实、业务规则与外部研究进入同一条可追溯的研判链路，辅助团队完成资料理解、规则匹配、风险提示、投研整理和流程协作。

[![Release](https://img.shields.io/badge/release-2.0.0-38bdf8.svg)](./CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-22c55e.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](https://www.typescriptlang.org/)
[![Security Policy](https://img.shields.io/badge/security-policy-f59e0b.svg)](./SECURITY.md)

[产品能力](#产品能力) · [快速开始](#快速开始) · [技术架构](#技术架构) · [安全边界](#安全与责任边界) · [路线图](#路线图)

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

FinOS AI 2.0 已完成企业金融信息架构、完整交互 UI 和核心体验闭环。开源版本无需登录即可进入演示工作区，适合产品评估、二次开发和方案验证。

| 能力 | 当前状态 |
| --- | --- |
| 企业工作台与九大业务模块 | 可用，支持完整页面交互 |
| 项目、资料、风险、规则、任务与 Agent 状态 | 浏览器本地持久化，可一键重置 |
| FastAPI、数据库、认证、文件与模型基础设施 | 已提供并具有自动化测试 |
| 真实企业数据全链路服务端持久化 | 规划中 |
| 企业组织、RBAC、审批权限与完整审计 | 规划中 |
| OCR 坐标、规则回放、模型评测与生产级人机复核 | 规划中 |

演示工作区不应承载真实客户资料、商业秘密或生产凭据。生产部署前请阅读 [安全策略](./SECURITY.md) 和 [安全设计](./docs/security.md)。

## 产品能力

| 模块 | 解决的问题 |
| --- | --- |
| 经营决策台 | 统一观察项目、资料、风险、任务和 Agent 运行态 |
| 项目中心 | 管理企业研判项目、行业、融资需求、负责人和推进阶段 |
| 资料研判 | 汇集 PDF、Word、Excel、CSV、TXT，关联原文、事实与引用 |
| 风险中心 | 按严重度聚合风险信号，展示规则、影响、证据和核验状态 |
| 投研中心 | 整理行业、政策、企业与舆情材料，沉淀专题研究底稿 |
| 规则库 | 管理准入、授信、并购、担保和供应链规则及版本状态 |
| Agent 中心 | 编排资料理解、规则匹配、风险研判和投研整理 Agent |
| 流程中心 | 创建并流转待处理、处理中、待复核和已完成任务 |
| 智能研判助手 | 基于项目上下文回答问题，并给出证据和规则依据 |

### 适用方向

- 企业经营质量分析与融资材料预审
- 授信尽调、贷前资料核验与风险排查
- 产业链、供应链金融和核心企业研究
- 并购、投融资项目资料整理与风险清单
- 制度规则检索、匹配和人工复核辅助
- 行业、政策、企业和舆情投研底稿整理

## 设计原则

- **Evidence first**：重要判断必须能回到原始资料、事实字段和引用位置。
- **Human in the loop**：Agent 生成提示和草稿，关键决策由授权人员确认。
- **Explainable rules**：展示规则命中原因、潜在影响、证据与处理状态。
- **Secure by default**：密钥不进入前端，上传和出站访问经过安全边界。
- **Open and self-hosted**：MIT 开源，支持自托管和按业务需要扩展。

## 技术架构

```text
Browser
  └─ Next.js 15 / React 19 / TypeScript / Tailwind CSS
       ├─ 企业体验工作区（Zustand 本地持久化）
       ├─ Route Handlers（会话桥接与同源 API）
       └─ FastAPI
            ├─ 访客会话 / JWT / HttpOnly Refresh Cookie
            ├─ 文档、Agent、任务、金融与审计服务
            ├─ SQLite（开发）/ PostgreSQL（生产）
            └─ Redis（可选，可降级）
```

| 层 | 技术 |
| --- | --- |
| 前端 | Next.js 15、React 19、TypeScript strict、Tailwind CSS、Zustand、Framer Motion |
| 后端 | FastAPI、SQLAlchemy 2、Pydantic v2、Uvicorn |
| 文档处理 | `pdf-parse`、`mammoth`、分块上传限制、路径边界校验 |
| 数据 | SQLite、PostgreSQL 16、Redis 7 |
| 安全 | 短期 Access Token、HttpOnly Refresh Cookie、AES-256-GCM、限流、可信代理、SSRF 防护 |
| 部署 | Docker Compose、nginx、独立 Next.js 运行产物 |

## 快速开始

### 只体验前端

要求：Node.js 20+。

```bash
git clone https://github.com/Leterhong/FinOS-AI.git
cd FinOS-AI
npm install
npm run dev
```

打开 <http://localhost:3000>。首次进入不需要账号，所有演示数据均为虚构数据。

### 启动完整本地服务

要求：Python 3.11+。

Windows PowerShell：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8300 --reload

# 另一个终端
$env:NEXT_PUBLIC_BACKEND_URL = "http://127.0.0.1:8300"
npm run dev
```

macOS / Linux：

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8300 --reload

# 另一个终端
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8300 npm run dev
```

后端健康检查：<http://127.0.0.1:8300/api/health>。

### Docker Compose

```bash
cp .env.example .env
# 替换所有 CHANGE_ME_* 值后再启动
docker compose up --build -d
```

通过 <http://localhost> 访问。Docker 默认经 nginx 使用同源 `/api` 代理，因此 `NEXT_PUBLIC_BACKEND_URL` 保持为空。

## 配置

配置模板：

- [`.env.example`](./.env.example)：Docker Compose
- [`.env.local.example`](./.env.local.example)：Next.js 本地开发
- [`backend/.env.example`](./backend/.env.example)：FastAPI

生产环境至少需要配置强随机值：

- `JWT_SECRET`
- `ENCRYPTION_MASTER_KEY`
- `FINOS_DATA_KEY`
- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`

不要给模型密钥添加 `NEXT_PUBLIC_` 前缀；该前缀变量会被编译进浏览器产物。真实 `.env`、数据库、上传目录、虚拟环境和构建产物均不应提交到 Git。

## 测试与质量门禁

```bash
npm run typecheck       # TypeScript 类型检查
npm test                # 前端契约与安全回归
npm run build           # Next.js 生产构建
npm run test:backend    # 后端与 AI 回归
```

测试使用隔离数据，不连接真实模型服务。更多信息见 [`tests/README.md`](./tests/README.md)。

## 安全与责任边界

已实现的核心控制包括：

- Access Token 仅驻留前端内存，Refresh Token 使用限定路径的 HttpOnly Cookie。
- Refresh Token 轮换与重放检测；Cookie 会话写操作使用 CSRF 防护。
- 生产环境缺失或使用弱 JWT 密钥时拒绝启动。
- 上传文件分块读取并限制大小，文件路径必须保持在允许目录内。
- Webhook 等出站 URL 拒绝本机、内网、保留地址和自动重定向。
- 仅信任明确配置的反向代理来源提供的转发地址。
- 模型密钥、数据库凭据和企业资料不进入公开仓库或浏览器构建。

当前开源工作区不是已经完成多租户认证、企业 RBAC、数据分级和审批隔离的 SaaS 产品。部署者必须自行完成组织权限、数据授权、日志留存、模型供应商评估和适用地区的监管合规。

发现漏洞时，请不要创建公开 Issue，也不要上传真实企业数据。按照 [`SECURITY.md`](./SECURITY.md) 使用 GitHub 私密漏洞报告。

## 项目结构

```text
FinOS-AI/
├─ src/app/(dashboard)/       # 企业工作台与九大业务模块
├─ src/components/enterprise/ # 企业 UI 基础组件
├─ src/store/                 # 工作区状态和业务操作
├─ src/types/                 # TypeScript 业务模型
├─ backend/                   # FastAPI、数据库、安全与服务层
├─ tests/                     # 前端、后端与 AI 回归测试
├─ deploy/                    # Docker 与 nginx 配置
└─ docs/                      # 架构、安全、API 与部署资料
```

## 路线图

- [x] 企业金融产品定位、信息架构与 UI 2.0
- [x] 项目、资料、风险、投研、规则、Agent、流程和助手体验闭环
- [x] 无登录演示、浏览器持久化和响应式适配
- [x] 会话、上传、出站访问、可信代理和并发任务安全加固
- [ ] 企业对象与工作流迁移到服务端数据库
- [ ] 组织、角色、项目权限、数据分级和完整审计日志
- [ ] OCR、表格结构识别和真实证据坐标
- [ ] 可配置规则引擎、版本管理和历史回放
- [ ] 模型网关、提示词防护、评测集和人机复核闭环
- [ ] 企业数据源连接器和可观测性体系

## 参与贡献

欢迎通过 Issue 讨论产品建议，通过 Pull Request 提交改进。提交前请：

1. 运行类型检查、测试和生产构建。
2. 不提交真实企业资料、个人信息、数据库或任何密钥。
3. 对安全问题使用私密报告渠道，而不是公开 Issue。
4. 在涉及金融判断时保留证据、解释和人工复核边界。

## License

本项目基于 [MIT License](./LICENSE) 开源。软件按“原样”提供，不构成投资、授信、法律、审计或合规意见。
