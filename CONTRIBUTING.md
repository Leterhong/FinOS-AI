# 贡献指南

感谢你对 FinOS AI 的关注！本文档帮助你快速上手贡献流程。

## 行为准则

参与本项目即表示你同意遵守 [行为准则](./CODE_OF_CONDUCT.md)。

## 如何贡献

### 报告 Bug

1. 搜索 [现有 Issue](https://github.com/Leterhong/FinOS-AI/issues) 确认未被报告
2. 使用 [Bug Report 模板](https://github.com/Leterhong/FinOS-AI/issues/new?template=bug_report.md) 创建 Issue
3. 提供复现步骤、预期行为、实际行为和环境信息

**不要在公开 Issue 中提交真实企业数据、API Key 或任何密钥。**

### 建议 Feature

1. 使用 [Feature Request 模板](https://github.com/Leterhong/FinOS-AI/issues/new?template=feature_request.md)
2. 说明使用场景、预期效果和替代方案
3. 与项目定位（Evidence-Driven Enterprise Financial Intelligence）保持一致

### 提交代码

1. Fork 仓库 → 创建分支（`feat/xxx` 或 `fix/xxx`）
2. 实现变更，确保以下门禁全部通过：

```bash
npm run typecheck       # TypeScript strict
npm test                # 前端契约（品牌红线 / 安全红线 / 部署契约）
npm run test:unit       # 纯函数单测（规则引擎等）
npm run build           # Next.js 生产构建
npm run test:backend    # 后端 pytest + ruff
node tests/e2e/main-chain.mjs  # 端到端主链路（需先 build，本地 mock LLM）
```

3. 提交 Pull Request，CI 自动执行上述门禁 + CodeQL

### 代码规范

- **TypeScript strict**：不使用 `any`、`@ts-ignore`
- **后端**：`ruff check backend` 通过
- **注释**：与周围代码风格一致，解释"为什么"而非"是什么"
- **安全**：新端点必须有认证；新用户输入必须有校验；不引入 `dangerouslySetInnerHTML`
- **设计**：使用 `--finos-*` CSS 令牌，不硬编码色值
- **零预置数据**：不添加任何示例企业/金额/风险到前端或后端

### 安全问题

**不要**通过公开 Issue 报告安全漏洞。按照 [SECURITY.md](./SECURITY.md) 使用 GitHub 私密漏洞报告。

### 提交信息

遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)：

```text
feat: 新增确定性规则引擎
fix(security): 修复跨租户 upsert 劫持
docs: 更新使用指引
refactor(ui): 提取 Button 组件
```

## 开发环境

| 依赖 | 版本 |
| --- | --- |
| Node.js | 20+ |
| Python | 3.11+ |
| 数据库 | SQLite（开发）/ PostgreSQL 16（生产） |

详见 [README 快速开始](./README.md#快速开始)。

## 项目结构

```text
src/app/(dashboard)/       # 13 个业务页面
src/app/api/               # Next.js Route Handlers（14 个）
src/components/ui/         # 基础 UI 组件
src/components/intelligence/ # AI 组件
src/components/evidence/   # 证据链组件
src/components/feedback/   # 反馈组件（Toast、ErrorState）
src/lib/rule-engine.ts     # 确定性规则引擎
backend/main.py            # FastAPI 入口（12 核心路由模块）
backend/enterprise/        # 企业对象持久化
backend/governance/        # 组织治理（RBAC/密级/审计）
tests/                     # 契约测试 + 单测 + e2e
```

## 路线图

查看 [README 路线图](./README.md#路线图) 了解当前进展与方向。
