<div align="center">

# FinOS AI

**面向企业经营与风险研判的开源金融服务 Agent**

将企业资料、经营数据、制度规则和外部研究组织成可追溯的研判证据链，辅助完成资料理解、规则匹配、风险提示、投研整理与流程协作。

[![License: MIT](https://img.shields.io/badge/License-MIT-22c55e.svg)](./LICENSE)
[![Next.js 15](https://img.shields.io/badge/Next.js-15-000000.svg)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-Python-009688.svg)](https://fastapi.tiangolo.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](https://www.typescriptlang.org/)

[快速开始](#快速开始) · [核心能力](#核心能力) · [架构](#技术架构) · [测试](#测试) · [产品路线](#产品路线)

</div>

---

## 产品定位

FinOS AI 不是个人记账工具，也不是自动投资或自动审批系统。它面向企业金融、产业金融、授信尽调和经营分析场景，围绕以下链路构建：

```text
企业项目 → 资料解析 → 事实抽取 → 规则匹配 → 风险信号
         → 人工核验 → 研究底稿 → 任务流转 → 研判结论
```

系统坚持四项原则：

- **结论有证据**：重要判断能够定位原始资料、事实字段和引用位置。
- **规则可解释**：风险信号同时展示命中规则、潜在影响和核验状态。
- **关键节点有人复核**：Agent 提供辅助判断，不替代授信、投资、合规或审批责任人。
- **开源与自托管**：MIT 协议，不内置付费墙，不默认向第三方传输企业资料。

> FinOS AI 提供信息分析和辅助决策，不构成投资、授信、法律或合规意见。

## 核心能力

| 模块 | 能力 |
| --- | --- |
| 企业经营决策台 | 项目、资料、风险与 Agent 运行态统一总览 |
| 项目中心 | 新建企业研判项目，管理融资金额、行业、负责人、进度和下一步动作 |
| 资料研判 | 上传 PDF / Word / Excel / CSV / TXT，联动原文、事实、规则和引用证据 |
| 风险中心 | 按严重度筛选风险，查看证据、规则、影响并进行人工核验 |
| 投研中心 | 汇总行业、政策、企业与舆情信息，生成专题研究底稿 |
| 规则库 | 管理准入、并购、供应链和担保等业务规则及版本状态 |
| Agent 中心 | 编排资料理解、规则匹配、风险研判与投研整理 Agent |
| 流程中心 | 创建核验任务并在待处理、处理中、待复核、已完成之间流转 |
| 智能研判助手 | 基于项目上下文回答问题，并展示证据与规则依据 |

当前开源演示工作区无需登录即可体验，交互数据在浏览器本地持久化，并可一键重置。后端同时保留 FastAPI、数据库、文件安全与模型网关基础设施，供后续接入真实组织数据。

## 技术架构

```text
Browser
  └─ Next.js 15 / React 19 / TypeScript / Tailwind CSS
       ├─ 企业工作区（Zustand 持久化体验层）
       ├─ Next Route Handlers（会话桥接与同源代理）
       └─ FastAPI
            ├─ 认证与 HttpOnly Refresh Cookie
            ├─ 文档、Agent、任务与金融服务
            ├─ SQLite（开发）/ PostgreSQL（生产）
            └─ Redis（可选，可降级）
```

| 层 | 技术 |
| --- | --- |
| 前端 | Next.js 15、React 19、TypeScript strict、Tailwind CSS、Zustand、Framer Motion |
| 后端 | FastAPI、SQLAlchemy 2、Pydantic v2、Uvicorn |
| 文档 | `pdf-parse`、`mammoth`、安全文件读取与大小限制 |
| 数据 | SQLite / PostgreSQL 16、Redis 7 |
| 安全 | HttpOnly Refresh Cookie、JWT、AES-256-GCM、可信代理解析、上传路径校验、限流 |
| 部署 | Docker Compose：nginx / web / api / PostgreSQL / Redis |

## 快速开始

### 本地开发

要求：Node.js 20+、Python 3.11+。

```bash
git clone https://github.com/Leterhong/FinOS-AI.git
cd FinOS-AI

npm install
python -m venv .venv
```

Windows PowerShell：

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8300 --reload

# 新终端
npm run dev
```

macOS / Linux：

```bash
source .venv/bin/activate
pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8300 --reload

# 新终端
npm run dev
```

访问：<http://localhost:3000>。后端健康检查：<http://127.0.0.1:8300/api/health>。

前端企业工作区可独立体验；需要调用后端文档、模型或数据库服务时再启动 FastAPI。

### Docker Compose

```bash
cp .env.example .env
# 替换全部 CHANGE_ME_* 密钥
docker compose up --build -d
```

通过 <http://localhost> 访问。Docker 环境中浏览器请求使用 nginx 的同源 `/api` 代理，因此 `NEXT_PUBLIC_BACKEND_URL` 保持为空即可。

## 环境变量

模板见 [`.env.example`](./.env.example)、[`.env.local.example`](./.env.local.example) 和 [`backend/.env.example`](./backend/.env.example)。真实 `.env`、`.env.local` 与 `backend/.env` 已被 Git 忽略。

本地最常用配置：

```dotenv
NEXT_PUBLIC_BACKEND_URL=http://127.0.0.1:8300
```

生产环境必须配置强随机值：

- `JWT_SECRET`
- `ENCRYPTION_MASTER_KEY`
- `FINOS_DATA_KEY`
- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`

不要为模型密钥添加 `NEXT_PUBLIC_` 前缀，否则密钥会进入浏览器构建产物。

## 测试

```bash
# TypeScript
npm run typecheck

# 前端契约与安全规则
npm test

# 后端与 AI 回归
python -m pytest -q

# 生产构建
npm run build
```

测试不会连接真实模型，也不会读取开发数据库。详细说明见 [`tests/README.md`](./tests/README.md)。

## 项目结构

```text
FinOS-AI/
├─ src/
│  ├─ app/(dashboard)/       # 企业工作台与九个业务模块
│  ├─ components/enterprise/ # 企业 UI 基础组件
│  ├─ data/                  # 开源演示数据
│  ├─ store/                 # 工作区状态与持久化操作
│  └─ types/                 # TypeScript 业务对象
├─ backend/                  # FastAPI、数据库、安全与服务层
├─ tests/                    # 前端、后端与 AI 回归测试
├─ deploy/                   # Docker 与 nginx 配置
├─ docs/                     # 架构、API、安全和部署文档
└─ docker-compose.yml
```

## 安全设计

- Access Token 仅保存在内存，Refresh Token 使用 HttpOnly Cookie。
- 服务端代理在 Windows 本地开发时规范化 `localhost`，避免 IPv6 解析导致 502 级联。
- 只信任配置的反向代理地址所提供的 `X-Forwarded-For`。
- 文件读取统一校验真实路径、扩展名和大小，阻止目录穿越与内网地址滥用。
- 生产弱密钥或缺失密钥时拒绝启动。
- 不提交真实模型密钥、数据库文件、上传文件、虚拟环境和构建产物。

更多内容见 [`docs/security.md`](./docs/security.md)。

## 产品路线

- [x] 企业金融信息架构与完整 UI 重构
- [x] 项目、资料、风险、投研、规则、Agent、流程和助手体验闭环
- [x] 无登录开源体验、浏览器持久化和移动端适配
- [x] 会话安全、上传安全、可信代理与错误级联修复
- [ ] 企业对象与工作流迁移到服务端数据库
- [ ] OCR、表格结构识别和真实证据坐标
- [ ] 可配置规则执行引擎与回放测试
- [ ] 组织、角色、项目权限和完整审计日志
- [ ] 真实模型网关、评测集和人机复核闭环

## 贡献

欢迎提交 Issue 与 Pull Request。提交前请确保类型检查、测试和生产构建全部通过，并且不包含任何真实企业资料或密钥。

## License

[MIT](./LICENSE) © 2026 FinOS AI Contributors
