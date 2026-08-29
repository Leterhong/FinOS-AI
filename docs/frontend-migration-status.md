> ⚠️ **本文档撰写于 1.x 个人财富版时期（2026-08-01 前后），部分内容与 2.0 企业版不一致，仅供历史参考；请以 README 与 docs/security.md 为准。**

# 前端数据通道迁移状态（Phase 7.0.2 · #292 + #293）

> 目标：逐步把核心前端页面的数据通道切到统一后端客户端 `backendApi`（FastAPI :8300），
> 把 Zustand 收缩为 UI/兼容状态。本阶段执行「谨慎、渐进、不破坏现有功能」策略。

## 关键架构事实

后端 FastAPI 的 `assets / twin / agent / rag / cfo / monitor / documents` 是 **与 Next.js `/api/*` + `.data` 本地存储并行的独立数据孤岛**，两者数据结构不同、数据不互通。因此本阶段**只做追加式接入**（后端作为新增面板/状态指示/触发入口），**不覆盖 store 的权威 UI 数据**，避免双写与数据分叉导致页面显示空/不一致。凡后端尚未 1:1 提供能力、或会破坏现有功能的路径，一律保留 `LEGACY` 并在下方标注。

## 数据域映射表

| 数据域 | 通道 | 页面 | 说明 / 后续计划 |
| --- | --- | --- | --- |
| Agent 编排任务（读/派发） | **backendApi**（追加） | agents | 新增「后端 Agent 编排任务」面板：`useAgentTasks` + `backendApi.agent.run`。原前端工作流可视化保留。 |
| Twin 状态（状态/重算） | **backendApi**（追加展示） | twin, dashboard | `useTwinStatus` + `useRecalculateTwin` 作为后端权威指示卡/徽标，不覆盖本地主指标。待后端与本地引擎数据对齐后升级为权威源。 |
| 资产 CRUD | LEGACY | data | 后端 `/assets` 为独立数据孤岛；列表来自 `loadFinancialData(.data)`。切读会显示空列表。后续需统一数据源后再迁移。 |
| 文档分析/确认 | LEGACY | documents | `confirm/reanalyze` 的 docId 来自 `.data` 存储，与后端 `documents` 服务非同一库；上传/列表/删除后端无等价。保留 Next 路由。 |
| 知识中心（stats/search/upload） | LEGACY | knowledge | 后端 `rag` 仅 `query/ingest/chunks`，无全局/个人库统计与上传到本地能力；结构不匹配。保留 `LEGACY`。 |
| AI 记忆 | LEGACY | memory | 后端 `/memory` 模型（fact/preference/event/insight+content）与页面模型（profile/goal/behavior/event+importance+evidence+source）结构不同，切换会丢功能。保留 `LEGACY`。 |
| 财富监控运行 | LEGACY | wealth-monitor | 后端 `monitor.run` 结果独立于 store.monitoring，切触发后 UI 无展示；通知走 proactive 旧通道。保留 `LEGACY`。 |
| Chat（SSE） | LEGACY | chat | 后端未提供 SSE chat；`/api/ai/usage` 等简单读也无等价。保留 `LEGACY`。 |
| 金融行情/市场/新闻/投资 | LEGACY | investments, data | 后端无 1:1 等价能力。保留 `LEGACY`。 |
| Proactive 通知/设置/调度 | LEGACY | (多页) | 后端 `notifications` 已存在但未接线；SSE proactive 旧通道保留。后续可切换。 |
| 工作流/Plan/Review/Copilot（SSE） | LEGACY | agents, chat | 后端未提供 SSE 等价。保留 `LEGACY`。 |

## 本阶段已修改文件

- `src/lib/backend-client.ts`：删除未使用且任务要求移除的 `rag.deleteChunk`。
- `src/hooks/use-backend.ts`：复用既有 `useTwinStatus / useAgentTasks / useRecalculateTwin / hasBackendToken`。
- `src/store/financial-store.ts`：头部新增「数据通道分区」注释块（#293a：UI 保留 / LEGACY 清单 / 已迁移能力）。
- `src/app/(dashboard)/agents/page.tsx`：追加「后端 Agent 编排任务」面板。
- `src/app/(dashboard)/twin/page.tsx`：追加「后端 Twin 引擎」卡 + 后端重算按钮。
- `src/app/(dashboard)/page.tsx`：欢迎区追加「后端 Twin 连接状态」徽标。

## 未删除的 store action

本阶段未删除任何 `financial-store` action：`loadUserProfile / loadFinancialData / runMonitor / loadProactive* / finance* / loadInvestmentData / importData / refreshData` 等仍被上述 LEGACY 页面引用。按硬约束，Grep 确认零引用前不删除。

## 验证

- `npx tsc --noEmit` 0 错误。
- 后端启动冒烟（见下方状态）：`:8300/api/twin/status` 等契约端点可达。
- dev 启动冒烟：`/login` 200、受保护页 307。

## 后续计划

1. 统一数据源：将 `.data` 本地存储迁移/对接到 FastAPI DB，使 `assets/twin/documents` 单一权威。
2. 数据对齐后，将 `data / documents / knowledge / memory / wealth-monitor` 的读路径正式切到 `backendApi` 并移除对应 LEGACY store action。
3. Proactive 通知接入后端 `notifications` 路由。
