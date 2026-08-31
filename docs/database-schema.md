> 本文档仍包含兼容旧部署所保留的历史表。当前企业产品面以 `enterprise_*` 表、AI 模型配置与审计安全表为主；历史个人财富表不进入新 UI 或企业 AI 上下文。

# 数据库设计 · Database Schema

> FinOS AI 共 **44 张业务表**，覆盖认证、财务、AI、多模态、Agent、个人 OS、智能自动化七大域。本文档描述表结构、字段约束、加密策略与 ER 关系。

## 1. 全局约定

| 约定 | 说明 |
|---|---|
| ORM | SQLAlchemy 2.0 Declarative（`Mapped` / `mapped_column` 风格），`Base` 定义于 `backend/database/base.py` |
| 主键 | 统一 `VARCHAR(32)`，值为 `uuid.uuid4().hex` |
| 时间戳 | `TIMESTAMP WITH TIME ZONE`，默认 `now()` |
| 用户隔离 | 43 张业务表含 `user_id VARCHAR(32) FK → users.id`；每表建 `user_id + created_at` 复合索引 |
| JSON 存储 | 复杂结构以 `TEXT` 存 JSON 字符串（如 `payload`、`conditions`、`steps`） |
| ORM 关系 | **全仓不使用 `relationship()`**，表间关联仅靠 `ForeignKey` 列 + 显式查询 |
| 数据库 | 生产 PostgreSQL；开发自动降级 SQLite（`backend/data/finos.db`） |

### 1.1 建表策略

- **开发**：`lifespan` → `init_db()` → `Base.metadata.create_all`，零配置自动建表
- **生产**：Alembic 单链迁移（当前 head：`7f16evidence`；依次包含 `7f14ent → 7f15scope → 7f16evidence` 企业工作区、项目隔离与证据链变更）
- **扩展已有表**：`create_all` 不会给已存在表加列。新增列时必须在 `init_db()` 末尾追加**幂等补列自愈**逻辑：

```python
insp = inspect(engine)
existing = {c["name"] for c in insp.get_columns("ai_usage_logs")}
for col, ddl in REQUIRED_COLUMNS.items():
    if col not in existing:
        conn.execute(text(f"ALTER TABLE ai_usage_logs ADD COLUMN {col} {ddl}"))
```

否则老库运行会直接抛 `OperationalError: no such column`。

## 2. 加密字段策略

敏感字段使用 `backend/security/types.py` 中的 SQLAlchemy `TypeDecorator`，在 ORM 读写时**透明加解密**（AES-256-GCM），底层存储为 `TEXT` 密文（前缀 `aesgcm:v1:`）。

| 表 | 字段 | 类型 | 加密方式 |
|---|---|---|---|
| `financial_profiles` | `income` | `EncryptedFloat` | AES-256-GCM 透明加密 |
| `financial_profiles` | `expense` | `EncryptedFloat` | AES-256-GCM 透明加密 |
| `assets` | `amount` | `EncryptedFloat` | AES-256-GCM 透明加密 |
| `transactions` | `amount` | `EncryptedFloat` | AES-256-GCM 透明加密 |
| `documents` | `storage_path` | `EncryptedString` | AES-256-GCM 透明加密 |
| `multimodal_inputs` | `storage_path` | `EncryptedString` | AES-256-GCM 透明加密 |
| `multimodal_inputs` | `raw_text` | `EncryptedString` | AES-256-GCM 透明加密 |
| `ai_model_configs` | `api_key_encrypted` | `TEXT` | **Fernet**（应用层加解密，非透明类型） |

主密钥来自环境变量 `ENCRYPTION_MASTER_KEY`（URL-safe Base64 编码的 32 字节随机值）。密钥丢失将导致密文**不可恢复**。

## 3. ER 关系图

```
                          ┌──────────────┐
                          │    users     │  (1)
                          │  id (PK)     │
                          │  email (UQ)  │
                          │ password_hash│
                          └──────┬───────┘
                                 │ 1 ─── N（43 张业务表均以 user_id 外键关联）
        ┌────────────────────────┼────────────────────────┬─────────────────┐
        │                        │                        │                 │
   ┌────▼─────┐          ┌───────▼────────┐      ┌────────▼───────┐  ┌──────▼──────┐
   │ 认证域    │          │    财务域       │      │    AI 域        │  │  安全域      │
   │refresh_  │          │financial_      │      │ai_usage_logs   │  │audit_logs   │
   │ tokens   │          │ profiles       │      │ai_sessions     │  │security_    │
   └──────────┘          │assets          │      │ai_model_configs│  │ events      │
                         │transactions    │      │knowledge_chunks│  └─────────────┘
                         │financial_twins │      └────────────────┘
                         └────────────────┘
        ┌────────────────────────┼────────────────────────┬─────────────────┐
   ┌────▼──────────┐   ┌─────────▼─────────┐   ┌──────────▼────────┐ ┌──────▼───────┐
   │  智能域        │   │    多模态域         │   │   个人 OS 域       │ │  自动化域     │
   │wealth_        │   │multimodal_inputs  │   │wealth_avatars     │ │automation_   │
   │ predictions   │   │      │ 1          │   │timeline_events    │ │ rules        │
   │scenario_      │   │      │ N          │   │knowledge_items    │ │ workflows    │
   │ simulations   │   │      ▼            │   │decision_journals  │ │ scheduled    │
   │wealth_        │   │multimodal_        │   │plan_versions      │ │ webhooks     │
   │ strategies    │   │ extractions       │   │daily_briefings    │ │ runs/actions │
   │health_score_  │   │ (input_id FK)     │   └───────────────────┘ │ market_cache │
   │ history       │   └───────────────────┘                         │ preferences  │
   │long_term_     │                                                 │ plans        │
   │ memories      │   ┌───────────────────┐   ┌──────────────────┐ │ snapshots    │
   └───────────────┘   │  Agent 域          │   │  文档/报告/任务    │ │ events       │
                       │user_agent_configs │   │documents         │ └──────────────┘
                       │agent_run_logs     │   │wealth_reports    │
                       │agent_tasks        │   │async_tasks       │
                       └───────────────────┘   │memories          │
                                               │notifications     │
                                               └──────────────────┘
```

**唯一的非 `users` 外键**：`multimodal_extractions.input_id → multimodal_inputs.id`（1─N）。其余 43 张表全部直接挂在 `users.id` 之下。

### 3.1 外键关系清单

| 子表.字段 | → | 父表.字段 | 基数 | 可空 |
|---|---|---|---|---|
| `refresh_tokens.user_id` | → | `users.id` | 1─N | 否 |
| `financial_profiles.user_id` | → | `users.id` | 1─N | 否 |
| `assets.user_id` | → | `users.id` | 1─N | 否 |
| `transactions.user_id` | → | `users.id` | 1─N | 否 |
| `financial_twins.user_id` | → | `users.id` | 1─N | 否 |
| `ai_usage_logs.user_id` | → | `users.id` | 1─N | 否 |
| `ai_sessions.user_id` | → | `users.id` | 1─N | 否 |
| `ai_model_configs.user_id` | → | `users.id` | 1─N | 否 |
| `knowledge_chunks.user_id` | → | `users.id` | 1─N | 否 |
| `documents.user_id` | → | `users.id` | 1─N | 否 |
| `memories.user_id` | → | `users.id` | 1─N | 否 |
| `notifications.user_id` | → | `users.id` | 1─N | 否 |
| `audit_logs.user_id` | → | `users.id` | 1─N | **是** |
| `security_events.user_id` | → | `users.id` | 1─N | **是** |
| `async_tasks.user_id` | → | `users.id` | 1─N | **是** |
| `agent_tasks.user_id` | → | `users.id` | 1─N | 否 |
| `wealth_predictions.user_id` | → | `users.id` | 1─N | 否 |
| `scenario_simulations.user_id` | → | `users.id` | 1─N | 否 |
| `wealth_strategies.user_id` | → | `users.id` | 1─N | 否 |
| `health_score_history.user_id` | → | `users.id` | 1─N | 否 |
| `long_term_memories.user_id` | → | `users.id` | 1─N | 否 |
| `multimodal_inputs.user_id` | → | `users.id` | 1─N | 否 |
| `multimodal_extractions.user_id` | → | `users.id` | 1─N | 否 |
| **`multimodal_extractions.input_id`** | → | **`multimodal_inputs.id`** | 1─N | 否 |
| `user_agent_configs.user_id` | → | `users.id` | 1─N | 否 |
| `agent_run_logs.user_id` | → | `users.id` | 1─N | 否 |
| `wealth_reports.user_id` | → | `users.id` | 1─N | 否 |
| `wealth_avatars.user_id` | → | `users.id` | 1─N | 否 |
| `timeline_events.user_id` | → | `users.id` | 1─N | 否 |
| `knowledge_items.user_id` | → | `users.id` | 1─N | 否 |
| `decision_journals.user_id` | → | `users.id` | 1─N | 否 |
| `plan_versions.user_id` | → | `users.id` | 1─N | 否 |
| `daily_briefings.user_id` | → | `users.id` | 1─N | 否 |
| `automation_*.user_id`（11 张） | → | `users.id` | 1─N | 否 |

## 4. 表清单（按模块）

| 模块 | 文件 | 表数 | 表名 |
|---|---|---|---|
| user | `backend/user/models.py` | 1 | `users` |
| auth | `backend/auth/models.py` | 1 | `refresh_tokens` |
| financial | `backend/financial/models.py` | 3 | `financial_profiles`, `assets`, `transactions` |
| ai | `backend/ai/models.py` | 3 | `ai_usage_logs`, `ai_sessions`, `ai_model_configs` |
| document | `backend/document/models.py` | 1 | `documents` |
| memory | `backend/memory/models.py` | 1 | `memories` |
| notification | `backend/notification/models.py` | 1 | `notifications` |
| security | `backend/security/models.py` | 2 | `audit_logs`, `security_events` |
| tasks | `backend/tasks/models.py` | 1 | `async_tasks` |
| services | `backend/services/models.py` | 3 | `financial_twins`, `agent_tasks`, `knowledge_chunks` |
| intelligence | `backend/intelligence/models.py` | 5 | `wealth_predictions`, `scenario_simulations`, `wealth_strategies`, `health_score_history`, `long_term_memories` |
| multimodal | `backend/multimodal/models.py` | 2 | `multimodal_inputs`, `multimodal_extractions` |
| agents | `backend/agents/models.py` | 2 | `user_agent_configs`, `agent_run_logs` |
| report | `backend/report/models.py` | 1 | `wealth_reports` |
| personal_os | `backend/personal_os/models.py` | 6 | `wealth_avatars`, `timeline_events`, `knowledge_items`, `decision_journals`, `plan_versions`, `daily_briefings` |
| autonomous | `backend/autonomous/models.py` | 11 | `automation_rules`, `automation_workflows`, `automation_scheduled`, `automation_webhooks`, `automation_runs`, `automation_actions`, `automation_market_cache`, `automation_preferences`, `automation_plans`, `automation_snapshots`, `automation_events` |
| **合计** | | **44** | |

## 5. 核心表结构

### 5.1 users（用户）

| 字段 | 类型 | 约束 | 默认 |
|---|---|---|---|
| `id` | VARCHAR(32) | PK | uuid hex |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL | — |
| `password_hash` | VARCHAR(255) | NOT NULL | bcrypt 哈希（**严禁明文**） |
| `avatar` | VARCHAR(512) | NULL | — |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` |

### 5.2 refresh_tokens（刷新令牌）

| 字段 | 类型 | 约束 | 默认 |
|---|---|---|---|
| `id` | VARCHAR(32) | PK | uuid |
| `jti` | VARCHAR(32) | UNIQUE, NOT NULL | JWT ID |
| `user_id` | VARCHAR(32) | FK → users.id | — |
| `expires_at` | TIMESTAMPTZ | NOT NULL | — |
| `revoked` | BOOLEAN | NOT NULL | `False` |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` |

**只存 jti 不存 token 本体**。刷新时旧 jti 立即置 `revoked=True`，实现轮换与重放防护。

### 5.3 financial_profiles（财富画像）

| 字段 | 类型 | 约束 | 默认 |
|---|---|---|---|
| `id` | VARCHAR(32) | PK | uuid |
| `user_id` | VARCHAR(32) | FK → users.id | — |
| `age` | INTEGER | NULL | — |
| `income` | **EncryptedFloat** | NOT NULL | `0.0` |
| `expense` | **EncryptedFloat** | NOT NULL | `0.0` |
| `risk_level` | VARCHAR(20) | NOT NULL | `balanced` |
| `goal` | VARCHAR(500) | NULL | — |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` |

### 5.4 assets（资产）

| 字段 | 类型 | 约束 | 默认 |
|---|---|---|---|
| `id` | VARCHAR(32) | PK | uuid |
| `user_id` | VARCHAR(32) | FK → users.id | — |
| `type` | VARCHAR(30) | INDEX | — |
| `name` | VARCHAR(200) | NOT NULL | — |
| `amount` | **EncryptedFloat** | NOT NULL | `0.0` |
| `source` | VARCHAR(30) | NOT NULL | `manual`（或 `document`/`multimodal`） |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` |

### 5.5 transactions（交易流水）

| 字段 | 类型 | 约束 | 默认 |
|---|---|---|---|
| `id` | VARCHAR(32) | PK | uuid |
| `user_id` | VARCHAR(32) | FK → users.id | — |
| `type` | VARCHAR(20) | NOT NULL | `income` / `expense` / `transfer` |
| `amount` | **EncryptedFloat** | NOT NULL | `0.0` |
| `category` | VARCHAR(50) | NOT NULL | `other` |
| `date` | TIMESTAMPTZ | NOT NULL | `now()` |

### 5.6 financial_twins（财富数字分身快照）

| 字段 | 类型 | 约束 | 默认 |
|---|---|---|---|
| `id` | VARCHAR(32) | PK | uuid |
| `user_id` | VARCHAR(32) | FK → users.id | — |
| `net_worth` | FLOAT | NOT NULL | `0.0` |
| `cash_flow` | FLOAT | NOT NULL | `0.0` |
| `risk_score` | FLOAT | NOT NULL | `0.0` |
| `health_score` | INTEGER | NOT NULL | `0` |
| `goal_progress` | FLOAT | NOT NULL | `0.0` |
| `snapshot` | TEXT | NOT NULL | `"{}"`（��整快照 JSON） |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` |

每次重算追加一行，保留历史用于趋势对比与事件触发。

### 5.7 ai_model_configs（AI 模型配置）

| 字段 | 类型 | 约束 | 默认 |
|---|---|---|---|
| `id` | VARCHAR(32) | PK | uuid |
| `user_id` | VARCHAR(32) | FK → users.id | — |
| `name` | VARCHAR(100) | NOT NULL | — |
| `provider` | VARCHAR(50) | NOT NULL | `openai-compatible` |
| `base_url` | VARCHAR(300) | NOT NULL | — |
| `model_id` | VARCHAR(100) | NOT NULL | — |
| `api_key_encrypted` | TEXT | NOT NULL | **Fernet 密文** |
| `key_mask` | VARCHAR(20) | NOT NULL | `****` |
| `is_default` | BOOLEAN | NOT NULL | `False` |
| `status` | VARCHAR(20) | NOT NULL | `unverified` |
| `created_at` | TIMESTAMPTZ | NOT NULL | `now()` |

任何 API 响应与数据导出**只返回 `key_mask`**，明文 Key 永不出库。

### 5.8 ai_usage_logs（AI 用量日志）

| 字段 | 类型 | 默认 |
|---|---|---|
| `id` | VARCHAR(32) PK | uuid |
| `user_id` | VARCHAR(32) FK | — |
| `model` | VARCHAR(100) | — |
| `provider` | VARCHAR(50) | `openai-compatible` |
| `tokens` | INTEGER | `0` |
| `input_tokens` | INTEGER | `0` |
| `output_tokens` | INTEGER | `0` |
| `latency_ms` | INTEGER | `0` |
| `request_type` | VARCHAR(30) | `generate` |
| `created_at` | TIMESTAMPTZ | `now()` |

> `provider` / `input_tokens` / `output_tokens` / `latency_ms` 为 Phase 7.6 新增，已配置幂等补列自愈。

### 5.9 multimodal_extractions（多模态提取结果）

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `id` | VARCHAR(32) PK | uuid | |
| `user_id` | VARCHAR(32) FK | — | |
| `input_id` | VARCHAR(32) FK → multimodal_inputs.id | — | INDEX |
| `kind` | VARCHAR(20) | `asset` | INDEX |
| `label` | VARCHAR(200) | — | |
| `asset_type` | VARCHAR(30) | `other` | |
| `amount` | FLOAT | `0.0` | |
| `currency` | VARCHAR(10) | `CNY` | |
| `occurred_at` | VARCHAR(40) | — | 原文日期串 |
| `confidence` | FLOAT | `0.5` | |
| `evidence` | TEXT | — | 提取依据原文片段 |
| `payload` | TEXT | `"{}"` | |
| `status` | VARCHAR(20) | **`needs_confirm`** | INDEX |
| `applied` | BOOLEAN | `False` | |
| `applied_ref` | VARCHAR(32) | — | 写入后的资产/交易 id |
| `created_at` | TIMESTAMPTZ | `now()` | |

**设计铁律**：识别结果默认 `needs_confirm`，必须用户显式确认才 `applied=True` 并写入 Twin。

## 6. 其余表字段速查

### intelligence 域

| 表 | 关键字段 |
|---|---|
| `wealth_predictions` | `horizon_years`, `net_worth_1y/5y/10y`, `retirement_gap`, `goal_probability`, `assumptions`(JSON), `payload`(JSON) |
| `scenario_simulations` | `event_type`(IDX), `label`, `params`, `baseline`, `scenario`, `impact`, `explanation` |
| `wealth_strategies` | `horizon`(IDX short/mid/long), `plan_key`(IDX A/B/C), `title`, `actions`(JSON), `expected_effect`, `tier` |
| `health_score_history` | `total_score`, `asset_score`, `cashflow_score`, `risk_score`, `goal_score`, `investment_score`, `protection_score`, `detail` |
| `long_term_memories` | `kind`(IDX), `key`(IDX，同 key 覆盖), `content`, `payload`, `importance`, `hit_count`, `updated_at` |

### multimodal / agents / report 域

| 表 | 关键字段 |
|---|---|
| `multimodal_inputs` | `modality`(IDX), `subtype`, `filename`, `mime`, `size_bytes`, `content_hash`(IDX), `storage_path`★, `raw_text`★, `summary`, `tier`, `status`(IDX), `error` |
| `user_agent_configs` | `agent_name`(IDX), `enabled`, `priority`, `focus`, `settings`(JSON), `updated_at` |
| `agent_run_logs` | `kind`(IDX), `agent_name`(IDX), `question`, `tier`, `ok`, `elapsed_ms`, `trace`(JSON), `result`(JSON) |
| `wealth_reports` | `kind`(IDX), `title`, `period`, `tier`, `content`(Markdown), `payload`, `section_count` |

### personal_os 域

| 表 | 关键字段 |
|---|---|
| `wealth_avatars` | `avatar_name`, `profile_summary`, `financial_status`, `life_stage`, `risk_preference`, `future_outlook`, `updated_at` |
| `timeline_events` | `title`, `category`(IDX past/now/future), `event_date`(IDX), `description`, `source`, `importance`, `payload` |
| `knowledge_items` | `title`, `content`, `source`(IDX), `source_ref`, `category`(IDX), `tags`(JSON), `favorite`, `updated_at` |
| `decision_journals` | `question`, `analysis`, `recommendation`, `chosen_plan`, `alternatives`, `payload` |
| `plan_versions` | `subject`(IDX), `version`, `title`, `content`, `change_note`, `payload` |
| `daily_briefings` | `brief_date`(IDX YYYY-MM-DD), `greeting`, `wealth_change`, `reminders`, `actions`, `tone`, `payload` |

### autonomous 域（11 张）

| 表 | 关键字段 |
|---|---|
| `automation_rules` | `name`, `enabled`, `trigger_type`(IDX), `conditions`(JSON DSL), `actions`(JSON 链), `tier`, `cooldown_seconds`, `last_triggered_at`, `trigger_count` |
| `automation_workflows` | `name`, `enabled`, `steps`(JSON), `tier`, `last_run_at`, `run_count` |
| `automation_scheduled` | `name`, `enabled`, `frequency`(IDX), `task_type`, `params`, `hour`, `weekday`, `day_of_month`, `next_run_at`(IDX), `run_count` |
| `automation_webhooks` | `name`, `url`, `method`, `headers`(JSON), `enabled`, `events`(JSON), `last_called_at`, `last_status`, `call_count` |
| `automation_runs` | `source`(IDX), `source_id`, `name`, `status`, `tier`, `llm_called`, `tokens_used`, `message` |
| `automation_actions` | `title`, `detail`, `category`, `priority`(IDX), `status`(IDX), `feedback`(JSON), `source_id`, `due_at`, `completed_at` |
| `automation_market_cache` | `symbol`(IDX), `market_type`, `price`, `history`(JSON), `currency`, `expires_at`(IDX), `fetched_at`, `provider` |
| `automation_preferences` | `dimension`(IDX), `value`(JSON), `confidence`, `sample_count`, `updated_at`(IDX) |
| `automation_plans` | `name`, `enabled`, `agent_kind`(IDX), `cadence`, `params`, `next_run_at`(IDX), `run_count`, `last_summary` |
| `automation_snapshots` | `total_assets`, `monthly_income`, `monthly_expense`, `risk_level`, `goal_progress` |
| `automation_events` | `event_type`(IDX), `metric`, `prev_value`, `new_value`, `change_pct`, `severity`, `summary`, `triggered_rule_ids`(JSON) |

### 其余表

| 表 | 关键字段 |
|---|---|
| `documents` | `filename`, `storage_path`★, `status` |
| `memories` | `memory_type`(IDX), `content` |
| `notifications` | `source`, `category`(IDX), `severity`(IDX), `title`, `body`, `read`, `archived` |
| `audit_logs` | `user_id`(可空), `action`(IDX), `resource`, `ip` |
| `security_events` | `user_id`(可空), `event_type`(IDX), `severity`(IDX), `details`, `ip` |
| `async_tasks` | `user_id`(可空), `task_type`(IDX), `status`(IDX), `payload`, `result`, `progress`, `error`, `started_at`, `finished_at` |
| `agent_tasks` | `task_type`(IDX), `status`(IDX), `result`, `finished_at` |
| `knowledge_chunks` | `document_id`(IDX), `category`(IDX), `title`, `text`, `vector`(JSON 向量) |

> ★ 表示该字段为 AES-256-GCM 透明加密。

## 7. 索引策略

- 每张业务表建立 `ix_<table>_user_created`（`user_id`, `created_at`）复合索引，服务「按用户 + 时间倒序」这一最高频查询
- 高频过滤字段单独建索引：`assets.type`、`notifications.category/severity`、`multimodal_extractions.status`、`automation_scheduled.next_run_at` 等
- `users.email`、`refresh_tokens.jti` 为唯一索引

## 8. 数据生命周期

| 操作 | 行为 |
|---|---|
| 用户注销 | `DELETE /api/security/account` 级联删除该用户在全部 43 张表中的数据（需密码 + 确认短语 `DELETE MY DATA`） |
| 数据导出 | `GET /api/backup/export` 导出本人全部数据（解密明文，模型 Key 仅掩码） |
| 整库备份 | `GET /api/backup/database` 保留密文，需 `X-Backup-Key` 头 |
| 清空 AI 记忆 | `DELETE /api/personal-os/privacy/memory` 仅清记忆表，不影响财务数据 |

---

**免责声明**：FinOS AI 提供信息分析和辅助决策，不构成投资建议。
