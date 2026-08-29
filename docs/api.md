> ⚠️ **本文档撰写于 1.x 个人财富版时期（2026-08-01 前后），部分内容与 2.0 企业版不一致，仅供历史参考；请以 README 与 docs/security.md 为准。**

# API 文档 · REST API Reference

> FinOS AI 后端共 **178 个 REST 端点**，全部挂载在 `/api` 前缀下。本文档按业务模块组织，标注方法、路径、功能与鉴权要求。
>
> 交互式 API 文档（Swagger UI）：服务启动后访问 `http://localhost:8300/docs`

## 1. 通用约定

### 1.1 Base URL

| 环境 | Base URL |
|---|---|
| 本地开发 | `http://127.0.0.1:8300/api` |
| Docker | `http://localhost/api`（经 Nginx 反代） |

全局前缀 `/api` 由 `settings.api_prefix` 定义，所有 router 经 `app.include_router(r, prefix=settings.api_prefix)` 挂载。**调用时漏写 `/api` 会得到 404。**

### 1.2 统一响应信封

所有接口返回统一结构：

```jsonc
// 成功
{ "success": true, "data": { /* 业务数据 */ }, "message": "" }

// 失败
{ "success": false, "error": "错误描述" }
```

前端 `src/lib/backend-client.ts` 会自动解包，业务代码直接拿到 `data`。

### 1.3 鉴权

除少数公开端点外，所有接口需要 JWT：

```http
Authorization: Bearer <access_token>
```

也支持 `finos_token` Cookie（浏览器场景）。Token 由 `POST /api/auth/login` 或 `/api/auth/register` 签发。

**公开端点（无需鉴权）**：

| 端点 | 说明 |
|---|---|
| `POST /api/auth/register` | 注册 |
| `POST /api/auth/login` | 登录 |
| `POST /api/auth/refresh` | 刷新令牌 |
| `POST /api/auth/logout` | 登出（吊销 refresh token） |
| `GET /api/auth/csrf` | 获取 CSRF token |
| `GET /api/intelligence/events` | 可模拟人生事件目录（静态数据） |
| `GET /api/backup/database` | 整库备份（改用 `X-Backup-Key` 头鉴权） |
| `GET /api/health` | 健康检查 |
| `GET /api/metrics` | 运行指标 |

### 1.4 状态码

| 码 | 含义 |
|---|---|
| 200 | 成功 |
| 401 | 未认证 / token 失效 |
| 403 | 已认证但无权限 |
| 404 | 资源不存在 **或越权访问**（不泄露资源存在性） |
| 422 | 请求参数不合法 |
| 429 | 触发限流 |
| 500 | 服务器内部错误（响应体不含堆栈） |

### 1.5 用户隔离

所有业务查询强制携带 `user_id` 过滤。访问他人资源等同资源不存在，统一返回 404。

### 1.6 限流

| 类型 | 默认限额 | 配置项 |
|---|---|---|
| 普通接口 | 300 次/分钟 | `API_RATE_LIMIT_PER_MINUTE` |
| AI 接口 | 30 次/分钟 | `AI_RATE_LIMIT_PER_MINUTE` |

---

## 2. 认证 Authentication（6）

| 方法 | 路径 | 功能 | 鉴权 |
|---|---|---|---|
| POST | `/api/auth/register` | 注册用户，bcrypt 哈希密码，签发 access + refresh | 否 |
| POST | `/api/auth/login` | 登录校验，签发 access + refresh | 否 |
| POST | `/api/auth/refresh` | Refresh Token 轮换，签发新令牌对并吊销旧 refresh | 否 |
| POST | `/api/auth/logout` | 吊销当前 refresh token（幂等） | 否 |
| GET | `/api/auth/csrf` | 下发双提交 CSRF token（cookie + 响应体） | 否 |
| GET | `/api/auth/me` | 获取当前登录用户信息 | 是 |

**示例：注册**

```bash
curl -X POST http://127.0.0.1:8300/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@finos.ai","password":"Demo@2026abc"}'
```

```jsonc
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOi...",
    "refresh_token": "eyJhbGciOi...",
    "user": { "id": "a1b2c3...", "email": "demo@finos.ai" }
  },
  "message": ""
}
```

**Token 有效期**：Access Token 7 天（`JWT_EXPIRE_MINUTES`），Refresh Token 30 天（`JWT_REFRESH_EXPIRE_DAYS`）。Refresh 采用**轮换机制**，每次刷新旧 refresh token 立即失效。

---

## 3. 用户 User（2）

| 方法 | 路径 | 功能 | 鉴权 |
|---|---|---|---|
| GET | `/api/user/me` | 获取当前用户信息 | 是 |
| PUT | `/api/user/avatar` | 更新用户头像（data URI） | 是 |

---

## 4. 财务 Financial（8）

| 方法 | 路径 | 功能 | 鉴权 |
|---|---|---|---|
| GET | `/api/financial/profile` | 财富画像 + Twin（无数据返回欢迎引导态） | 是 |
| POST | `/api/financial/profile` | 创建/更新财富画像 | 是 |
| GET | `/api/financial/assets` | 资产列表 + 总额 | 是 |
| POST | `/api/financial/assets` | 添加资产 | 是 |
| DELETE | `/api/financial/assets/{asset_id}` | 删除资产 | 是 |
| GET | `/api/financial/transactions` | 交易列表 | 是 |
| POST | `/api/financial/transactions` | 添加交易 | 是 |
| POST | `/api/financial/twin/recalculate` | 强制重算 Financial Twin | 是 |

**示例：添加资产**

```bash
curl -X POST http://127.0.0.1:8300/api/financial/assets \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"deposit","name":"招商银行活期","amount":120000}'
```

`amount` 字段以 `EncryptedFloat` 类型加密存储，数据库中为 AES-256-GCM 密文。

### 4.1 资产服务层 Assets（4，前缀 `/assets`）

| 方法 | 路径 | 功能 | 鉴权 |
|---|---|---|---|
| GET | `/api/assets` | 资产列表 + 总额 | 是 |
| POST | `/api/assets` | 新增资产 | 是 |
| PUT | `/api/assets/{asset_id}` | 修改资产 | 是 |
| DELETE | `/api/assets/{asset_id}` | 删除资产 | 是 |

### 4.2 财富分身 Twin（2）

| 方法 | 路径 | 功能 | 鉴权 |
|---|---|---|---|
| POST | `/api/twin/recalculate` | 重算并保存 Twin 快照 | 是 |
| GET | `/api/twin/status` | 最新 Twin 状态 + 历史 | 是 |

---

## 5. AI 能力（12）

| 方法 | 路径 | 功能 | 鉴权 |
|---|---|---|---|
| POST | `/api/ai/models` | 保存 AI 模型配置（API Key 加密入库） | 是 |
| GET | `/api/ai/models` | 模型配置列表（**绝不返回 Key**，仅掩码） | 是 |
| DELETE | `/api/ai/models/{config_id}` | 删除模型配置 | 是 |
| POST | `/api/ai/models/{config_id}/test` | 后端解密并测试连通性 | 是 |
| POST | `/api/ai/generate` | 调用 LLM 生成（用量落库） | 是 |
| POST | `/api/ai/stream` | SSE 流式生成 | 是 |
| POST | `/api/ai/embed` | 文本向量化 | 是 |
| GET | `/api/ai/usage` | 用量统计（`{usage[], totals}`） | 是 |
| GET | `/api/ai/sessions` | AI 会话列表 | 是 |
| GET | `/api/ai/sessions/{session_id}` | 会话详情 + 消息 | 是 |
| POST | `/api/ai/sessions` | 保存/更新会话 | 是 |
| DELETE | `/api/ai/sessions/{session_id}` | 删除会话 | 是 |

**安全说明**：API Key 使用 Fernet 加密后存入 `ai_model_configs.api_key_encrypted`，任何响应只返回 `key_mask`（形如 `sk-****abcd`）。数据导出接口同样只导出掩码。

---

## 6. 文档 Documents（4 + 3）

| 方法 | 路径 | 功能 | 鉴权 |
|---|---|---|---|
| POST | `/api/documents/upload` | 上传文件（按用户隔离目录存储） | 是 |
| GET | `/api/documents` | 当前用户文件列表 | 是 |
| GET | `/api/documents/{doc_id}/download` | 下载文件（含路径穿越防护） | 是 |
| DELETE | `/api/documents/{doc_id}` | 删除记录 + 物理文件 | 是 |
| POST | `/api/documents/analyze` | 解析已上传文件，返回候选财富记录 | 是 |
| POST | `/api/documents/{document_id}/analyze-async` | 异步解析，返回 `task_id` | 是 |
| POST | `/api/documents/{document_id}/confirm` | 确认候选记录，写入资产 | 是 |

异步解析结果通过 `GET /api/tasks/{task_id}` 轮询。

---

## 7. 财富智能引擎 Intelligence（18）

| 方法 | 路径 | 功能 | 鉴权 |
|---|---|---|---|
| POST | `/api/intelligence/predict` | 财富预测（多期限 + 现金流 + 退休 + 目标概率） | 是 |
| GET | `/api/intelligence/timeline` | 财富 Timeline | 是 |
| GET | `/api/intelligence/score` | 六维财富健康评分 | 是 |
| GET | `/api/intelligence/score/history` | 评分历史 | 是 |
| GET | `/api/intelligence/events` | 可模拟人生事件目录 | **否** |
| POST | `/api/intelligence/simulate` | 人生事件情景模拟 | 是 |
| GET | `/api/intelligence/simulations` | 模拟历史 | 是 |
| POST | `/api/intelligence/compare` | 方案 A/B/C 对比 | 是 |
| POST | `/api/intelligence/strategy` | 短/中/长期财富策略 | 是 |
| GET | `/api/intelligence/strategies` | 策略历史 | 是 |
| POST | `/api/intelligence/workflow` | 多 Agent 工作流 | 是 |
| GET | `/api/intelligence/memories` | 长期记忆列表 | 是 |
| POST | `/api/intelligence/memories` | 写入长期记忆 | 是 |
| POST | `/api/intelligence/memories/sync` | 从档案自动沉淀记忆 | 是 |
| DELETE | `/api/intelligence/memories/{memory_id}` | 删除记忆 | 是 |
| POST | `/api/intelligence/chat` | AI CFO 连续对话 | 是 |
| DELETE | `/api/intelligence/chat/{session_id}` | 清空会话上下文 | 是 |
| GET | `/api/intelligence/overview` | 财富实验室总览聚合 | 是 |

**六维评分**：资产结构、现金流、风险、目标、投资、保障，各 0-100 加权得出总分。

---

## 8. 多模态 Multimodal（10）

| 方法 | 路径 | 功能 | 鉴权 |
|---|---|---|---|
| GET | `/api/multimodal/capabilities` | 能力探测（按依赖决定可用入口） | 是 |
| POST | `/api/multimodal/text` | 文本摄入识别 | 是 |
| POST | `/api/multimodal/upload` | 统一上传（图片/文件/音频自动分派） | 是 |
| POST | `/api/multimodal/speech` | 语音财富助手 | 是 |
| GET | `/api/multimodal/pending` | 待确认识别结果 | 是 |
| POST | `/api/multimodal/confirm` | 确认提取结果写入 Twin | 是 |
| POST | `/api/multimodal/reject` | 拒绝提取结果 | 是 |
| GET | `/api/multimodal/inputs` | 输入历史 | 是 |
| GET | `/api/multimodal/inputs/{input_id}` | 输入详情 | 是 |
| DELETE | `/api/multimodal/inputs/{input_id}` | 删除输入记录 | 是 |

**重要**：多模态识别结果一律先置为 `needs_confirm` 状态，**必须经用户显式确认**才写入 Financial Twin，AI 不得自动改动用户财务数据。

---

## 9. AI Agent 生态（7 + 3）

| 方法 | 路径 | 功能 | 鉴权 |
|---|---|---|---|
| GET | `/api/agents/market` | Agent Marketplace（含本人启用状态） | 是 |
| PUT | `/api/agents/market/{name}` | 配置 Agent 开关/优先级/关注点 | 是 |
| GET | `/api/agents/tools` | 可用工具列表 | 是 |
| POST | `/api/agents/tools/call` | 调用工具（强制本人上下文） | 是 |
| POST | `/api/agents/run/{name}` | 运行单个 Agent | 是 |
| POST | `/api/agents/workflow` | 多 Agent 工作流编排 | 是 |
| GET | `/api/agents/runs` | Agent 执行记录 | 是 |
| POST | `/api/agent/tasks` | 触发一次 Agent 编排（持久化） | 是 |
| GET | `/api/agent/tasks` | 编排任务列表 | 是 |
| GET | `/api/agent/tasks/{task_id}` | 任务详情 + 结果 | 是 |

详见 [ai-agent.md](./ai-agent.md)。

---

## 10. 知识检索 RAG（4）+ CFO（1）+ 监控（1）

| 方法 | 路径 | 功能 | 鉴权 |
|---|---|---|---|
| POST | `/api/rag/query` | 知识检索 + 可选 LLM 作答 | 是 |
| POST | `/api/rag/ingest` | 入库知识切片（生成 embedding） | 是 |
| GET | `/api/rag/chunks` | 列出本人知识切片 | 是 |
| DELETE | `/api/rag/chunks/{chunk_id}` | 删除知识切片 | 是 |
| POST | `/api/cfo/analyze` | 生成财富建议（读 Twin + Memory + RAG） | 是 |
| POST | `/api/monitor/run` | 运行监控流水线，变化写入通知 | 是 |

---

## 11. 报告 Reports（6）

| 方法 | 路径 | 功能 | 鉴权 |
|---|---|---|---|
| GET | `/api/reports/kinds` | 报告模板种类 + 导出能力 | 是 |
| POST | `/api/reports/generate` | 生成财富报告 | 是 |
| GET | `/api/reports` | 报告列表 | 是 |
| GET | `/api/reports/{report_id}` | 报告详情 | 是 |
| GET | `/api/reports/{report_id}/export` | 导出 markdown / html / pdf | 是 |
| DELETE | `/api/reports/{report_id}` | 删除报告 | 是 |

---

## 12. 个人 OS Personal OS（24）

### 12.1 财富分身与时间线

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/personal-os/avatar` | 财富分身视图 |
| POST | `/api/personal-os/avatar` | 重命名分身 |
| GET | `/api/personal-os/timeline` | 财富时间线 |
| POST | `/api/personal-os/timeline/events` | 添加时间线事件 |
| DELETE | `/api/personal-os/timeline/events/{event_id}` | 删除事件 |

### 12.2 记忆中心

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/personal-os/memory` | 记忆列表 |
| POST | `/api/personal-os/memory` | 添加记忆 |
| PUT | `/api/personal-os/memory/{memory_id}` | 更新记忆 |
| DELETE | `/api/personal-os/memory/{memory_id}` | 删除记忆 |

### 12.3 知识中心

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/personal-os/knowledge` | 知识条目列表 |
| POST | `/api/personal-os/knowledge` | 添加条目 |
| PUT | `/api/personal-os/knowledge/{item_id}` | 更新条目 |
| POST | `/api/personal-os/knowledge/{item_id}/favorite` | 收藏切换 |
| DELETE | `/api/personal-os/knowledge/{item_id}` | 删除条目 |

### 12.4 日报、决策与方案

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/personal-os/briefing` | 每日财富日报 |
| POST | `/api/personal-os/briefing/generate` | 重新生成日报 |
| GET | `/api/personal-os/decisions` | 决策记录列表 |
| POST | `/api/personal-os/decisions` | 添加决策记录 |
| GET | `/api/personal-os/plan-versions` | 方案版本列表 |
| POST | `/api/personal-os/plan-versions` | 添加方案版本 |

### 12.5 驾驶舱、搜索与隐私

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/personal-os/command-center` | 首页驾驶舱聚合数据 |
| GET | `/api/personal-os/search` | 全局搜索（跨资产/记忆/知识/决策/方案/目标） |
| GET | `/api/personal-os/privacy/export` | 导出本人全部数据（GDPR 数据可携权） |
| DELETE | `/api/personal-os/privacy/memory` | 清空 AI 记忆 |

以上 24 个端点全部需要鉴权。

---

## 13. 智能自动化 Autonomous（46）

### 13.1 控制中心

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/autonomous/overview` | 自动化总览 |
| POST | `/api/autonomous/bootstrap` | 初始化自动化引擎 |
| POST | `/api/autonomous/scan` | 立即扫描 + 运行工作流 |
| GET | `/api/autonomous/insights` | 自动化洞察 |
| GET | `/api/autonomous/cost` | AI 成本汇总 |
| GET | `/api/autonomous/events` | 事件总线记录 |
| GET | `/api/autonomous/runs` | 运行记录列表 |

### 13.2 规则引擎

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/autonomous/rules` | 规则列表 |
| POST | `/api/autonomous/rules` | 创建规则 |
| PUT | `/api/autonomous/rules/{rule_id}` | 更新规则 |
| DELETE | `/api/autonomous/rules/{rule_id}` | 删除规则 |
| POST | `/api/autonomous/rules/{rule_id}/run` | 手动触发 |

规则使用条件 DSL（JSON 数组），支持指标阈值、变化率、复合条件。

### 13.3 定时任务

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/autonomous/schedules` | 定时任务列表 |
| POST | `/api/autonomous/schedules` | 创建定时任务 |
| PUT | `/api/autonomous/schedules/{schedule_id}` | 更新 |
| DELETE | `/api/autonomous/schedules/{schedule_id}` | 删除 |
| POST | `/api/autonomous/schedules/{schedule_id}/run` | 手动执行 |

支持 `daily` / `weekly` / `monthly` 频率。

### 13.4 工作流

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/autonomous/workflows/templates` | 工作流模板 |
| GET | `/api/autonomous/workflows` | 工作流列表 |
| POST | `/api/autonomous/workflows` | 创建 |
| PUT | `/api/autonomous/workflows/{workflow_id}` | 更新 |
| DELETE | `/api/autonomous/workflows/{workflow_id}` | 删除 |
| POST | `/api/autonomous/workflows/{workflow_id}/run` | 执行 |

### 13.5 Webhook

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/autonomous/webhooks` | 列表 |
| POST | `/api/autonomous/webhooks` | 创建 |
| DELETE | `/api/autonomous/webhooks/{webhook_id}` | 删除 |
| POST | `/api/autonomous/webhooks/{webhook_id}/test` | 测试推送 |

### 13.6 行动中心

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/autonomous/actions` | 行动项列表 |
| POST | `/api/autonomous/actions` | 创建行动项 |
| GET | `/api/autonomous/actions/stats` | 行动项统计 |
| POST | `/api/autonomous/actions/{action_id}/complete` | 标记完成 |
| POST | `/api/autonomous/actions/{action_id}/dismiss` | 忽略 |
| POST | `/api/autonomous/actions/{action_id}/defer` | 延期 |
| POST | `/api/autonomous/actions/{action_id}/reopen` | 重新打开 |
| DELETE | `/api/autonomous/actions/{action_id}` | 删除 |

用户对行动项的反馈（完成/忽略/延期）会**即时反哺偏好学习**。

### 13.7 长期计划

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/autonomous/plans` | 计划列表 |
| POST | `/api/autonomous/plans` | 创建 |
| PUT | `/api/autonomous/plans/{plan_id}` | 更新 |
| DELETE | `/api/autonomous/plans/{plan_id}` | 删除 |
| POST | `/api/autonomous/plans/{plan_id}/run` | 执行巡检 |

### 13.8 偏好学习与行情

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/autonomous/preferences` | 偏好画像 |
| POST | `/api/autonomous/preferences/learn` | 触发偏好学习 |
| GET | `/api/autonomous/preferences/bias` | 通知偏好偏差 |
| GET | `/api/autonomous/market/price` | 查询市场价格 |
| GET | `/api/autonomous/market/history` | 历史行情 |
| GET | `/api/autonomous/market/portfolio-change` | 组合涨跌 |

行情服务采用 Provider 链 + 熔断机制，全部失败时降级为确定性本地估算，页面不报错。

---

## 14. 记忆与通知

### 14.1 记忆 Memory（3）

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/memory` | AI 长期记忆列表 |
| POST | `/api/memory` | 创建记忆 |
| DELETE | `/api/memory/{memory_id}` | 删除记忆 |

### 14.2 通知 Notifications（5）

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/notifications` | 通知列表（支持分类/归档/未读过滤） |
| POST | `/api/notifications` | 创建通知 |
| POST | `/api/notifications/{notification_id}/read` | 标记已读 |
| POST | `/api/notifications/{notification_id}/archive` | 切换归档 |
| DELETE | `/api/notifications/{notification_id}` | 删除通知 |

---

## 15. 安全与备份

### 15.1 安全 Security（3）

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/security/audit-logs` | 当前用户审计日志 |
| GET | `/api/security/events` | 当前用户安全事件 |
| DELETE | `/api/security/account` | 注销账户及全部数据 |

**账户注销**需同时提供正确密码与确认短语 `DELETE MY DATA`，防误操作。

### 15.2 备份 Backup（2）

| 方法 | 路径 | 功能 | 鉴权 |
|---|---|---|---|
| GET | `/api/backup/export` | 导出当前用户全部数据（json/csv） | JWT |
| GET | `/api/backup/database` | 整库逻辑备份（保留密文） | `X-Backup-Key` 头 |

整库备份需携带 `X-Backup-Key: <BACKUP_API_KEY>`，且导出内容中模型 API Key **仅为掩码，绝不含明文**。

---

## 16. 任务与运维

| 方法 | 路径 | 功能 | 鉴权 |
|---|---|---|---|
| POST | `/api/tasks` | 创建异步任务，返回 `task_id` | 是 |
| GET | `/api/tasks/{task_id}` | 轮询任务状态与结果 | 是 |
| GET | `/api/health` | 健康检查（db / redis / ai / uptime） | 否 |
| GET | `/api/metrics` | 接口耗时与错误率统计（无 PII） | 否 |

**健康检查示例**

```bash
curl http://127.0.0.1:8300/api/health
```

```jsonc
{
  "success": true,
  "data": {
    "status": "ok",
    "database": "ok",
    "redis": "degraded",
    "ai": "ok",
    "uptime_seconds": 3821
  }
}
```

---

## 17. 端点统计总表

| 模块 | 前缀 | 端点数 |
|---|---|---|
| auth | `/auth` | 6 |
| user | `/user` | 2 |
| financial | `/financial` | 8 |
| ai | `/ai` | 12 |
| document | `/documents` | 4 |
| memory | `/memory` | 3 |
| notification | `/notifications` | 5 |
| assets（服务层） | `/assets` | 4 |
| twin | `/twin` | 2 |
| rag | `/rag` | 4 |
| agent tasks | `/agent/tasks` | 3 |
| cfo | `/cfo` | 1 |
| monitor | `/monitor` | 1 |
| document（服务层） | `/documents` | 3 |
| security | `/security` | 3 |
| intelligence | `/intelligence` | 18 |
| multimodal | `/multimodal` | 10 |
| agents | `/agents` | 7 |
| report | `/reports` | 6 |
| personal_os | `/personal-os` | 24 |
| autonomous | `/autonomous` | 46 |
| backup | `/backup` | 2 |
| tasks | `/tasks` | 2 |
| health | — | 1 |
| metrics | — | 1 |
| **合计** | | **178** |

---

**免责声明**：FinOS AI 提供信息分析和辅助决策，不构成投资建议。
