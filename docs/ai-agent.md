# AI 与 Agent 体系 · AI & Agent Architecture

> FinOS AI 的智能层由四部分组成：LLM 网关、财富智能引擎、Agent 生态、RAG 知识检索。本文档描述它们的设计、协作方式与扩展方法。

## 1. 设计哲学

| 原则 | 说明 |
|---|---|
| **AI 是增强，不是依赖** | 任何 LLM 不可用的场景，系统必须仍能返回有意义的确定性结果（`tier="local"`），页面不得白屏或报错 |
| **用户自带模型** | 不内置任何 API Key，用户配置自己的 OpenAI 兼容服务，数据不经第三方中转 |
| **AI 不擅自改数据** | 所有识别与提取结果先置 `needs_confirm`，必须用户显式确认才写入财务数据 |
| **可解释** | 推荐与分析采用三段式推理输出（现状 → 依据 → 建议），而非黑盒结论 |
| **成本可控** | 每日 LLM 预算上限，超限自动降级本地算法 |

## 2. LLM 网关

### 2.1 架构

```
业务模块（intelligence / agents / report / autonomous / cfo）
                    │
                    ▼
     backend/ai/gateway/provider.py  （全 async）
                    │
      ┌─────────────┴──────────────┐
      │                            │
   有可用模型配置？               无配置
      │                            │
      ▼                            ▼
 解密 API Key (Fernet)      ┌──────────────────┐
      │                     │  本地确定性算法   │
      ▼                     │  tier = "local"  │
 调用 OpenAI 兼容接口        └──────────────────┘
      │                            ▲
      ├── 成功 → 落 ai_usage_logs   │
      │         tier = "llm"        │
      └── 失败/超时/预算耗尽 ────────┘
```

### 2.2 降级链

| 触发条件 | 行为 |
|---|---|
| 用户未配置任何模型 | 直接走本地算法 |
| API Key 无效 / 服务不可达 | 捕获异常 → 本地算法 |
| 请求超时 | 中断 → 本地算法 |
| 每日 LLM 预算耗尽（默认 20 次） | 跳过 LLM → 本地算法 |
| LLM 返回内容无法解析 | 丢弃 → 本地算法 |

所有响应携带 `tier` 字段（`"llm"` 或 `"local"`），前端据此显示能力标识，用户始终知道当前结果的来源。

### 2.3 同步上下文调用

网关全部是 `async`。在同步上下文中调用时，参考 `backend/intelligence/reasoning/explain.py::_run_generate` 的模式：检测是否存在 running loop，若有则用线程池执行 `asyncio.run`。

```python
def _run_generate(prompt: str) -> str:
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(gateway.generate(prompt))
    with ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(lambda: asyncio.run(gateway.generate(prompt))).result()
```

### 2.4 用量记录

每次 LLM 调用落库 `ai_usage_logs`：

| 字段 | 内容 |
|---|---|
| `model` / `provider` | 模型标识与厂商 |
| `input_tokens` / `output_tokens` / `tokens` | 输入、输出、总 token |
| `latency_ms` | 端到端耗时 |
| `request_type` | `generate` / `stream` / `embed` |

前端 `/usage` 页面聚合展示（`GET /api/ai/usage` 返回 `{usage[], totals}`）。

## 3. 财富智能引擎 Intelligence

`backend/intelligence/` 提供六大能力，全部具备 LLM 与本地双通道。

### 3.1 模块结构

| 子模块 | 职责 |
|---|---|
| `prediction/` | 财富预测：多期限净资产、现金流、退休缺口、目标达成概率 |
| `scoring/` | 六维财富健康评分 |
| `simulation/` | 人生事件情景模拟与方案 A/B/C 对比 |
| `reasoning/` | 三段式可解释推理 |
| `recommendation/` | 策略建议（短/中/长期） |
| `planner/` | 多 Agent 并行编排 |
| `ltm/` | 长期记忆 2.0 |

### 3.2 六维财富健康评分

| 维度 | 评估内容 |
|---|---|
| 资产结构 | 资产类别分布、集中度 |
| 现金流 | 储蓄率、收支稳定性 |
| 风险 | 风险敞口与偏好匹配度 |
| 目标 | 财富目标达成进度 |
| 投资 | 投资配置合理性 |
| 保障 | 保险覆盖充分性 |

各维度 0-100 加权得出总分，历史写入 `health_score_history` 供趋势对比。

### 3.3 三段式推理

推荐输出统一遵循可解释结构：

```
【现状】 你的应急储备可覆盖 8.6 个月支出，高于 6 个月的常见基准。
【依据】 活期与货币基金合计 ¥155,000，月支出 ¥18,000。
【建议】 可考虑将超出 6 个月的部分（约 ¥47,000）配置到更高收益的品种。
```

### 3.4 目标金额解析

`parse_goal_amount` 采用三段式识别策略，处理中文自然语言金额：

1. **单位后缀**：`亿` / `万` / `w` / `k` → 按倍数换算
2. **显式元**：`100万元`、`50000元` → 直接取值
3. **裸数字**：仅当 ≥ 10000 时视为金额（避免把年龄、年份误判为目标）

## 4. Agent 生态

### 4.1 内置 Agent

`backend/agents/plugins/` 提供 5 个财富 Agent：

| Agent | `name` | 职责 |
|---|---|---|
| 现金流 Agent | `cashflow` | 分析收支结构、储蓄率与应急金覆盖月数 |
| 保险规划 Agent | `insurance` | 评估寿险/重疾保额是否覆盖负债与家庭开支，识别保障缺口 |
| 投资配置 Agent | `investment` | 分析资产配置结构与集中度风险，给出再平衡方向 |
| 退休规划 Agent | `retirement` | 测算退休资金缺口、可支撑年限，并给出补足路径 |
| 税务优化 Agent | `tax` | 估算工资薪金个税负担，识别专项附加扣除与税优账户空间 |

### 4.2 Agent 运行流程

```
POST /api/agents/run/{name}
        │
        ▼
[registry] 查找 Agent 类
        │
        ▼
[context] 构建用户上下文（Twin + 画像 + 资产 + 记忆）
        │            ↑ 强制注入当前 user_id，Agent 无法越权
        ▼
[Agent.run()] 执行分析
        │
        ├─ 调用 tools（读资产 / 算指标 / 查行情）
        └─ 可选调用 LLM 生成自然语言结论
        ▼
[agent_run_logs] 落库执行记录（trace / tier / 耗时 / 结果）
        ▼
返回结构化结果
```

### 4.3 Agent Marketplace

`GET /api/agents/market` 返回全部 Agent 及当前用户的配置：

| 可配置项 | 说明 |
|---|---|
| `enabled` | 是否启用（禁用后不参与工作流，执行时标记 `skipped`） |
| `priority` | 执行优先级（数字越小越优先） |
| `focus` | 用户关注点，注入 Agent prompt |
| `settings` | Agent 私有配置（JSON） |

配置存于 `user_agent_configs` 表，按用户隔离。

### 4.4 工具系统

`backend/agents/tools.py` 提供 Agent 可调用的工具集，覆盖资产读取、指标计算、行情查询等。工具调用通过 `POST /api/agents/tools/call` 暴露，**强制绑定当前用户上下文**，参数中无法指定他人 `user_id`。

### 4.5 多 Agent 工作流

`POST /api/agents/workflow` 支持编排多个 Agent 协作：

```
用户提问
    │
    ▼
[规划] 根据问题选择相关 Agent（按 priority 排序）
    │
    ├──▶ cashflow    ─┐
    ├──▶ investment  ─┤ 并行执行
    ├──▶ retirement  ─┘
    │
    ▼
[汇总] 合并各 Agent 结论，消解冲突
    │
    ▼
[输出] 统一结构化建议 + 执行 trace
```

被禁用的 Agent 会被跳过并在 trace 中标记 `skipped`，不影响整体流程。

### 4.6 扩展新 Agent

在 `backend/agents/plugins/` 新建文件：

```python
from backend.agents.base import BaseAgent

class MyAgent(BaseAgent):
    name = "my_agent"
    display_name = "我的 Agent"
    description = "一句话说明这个 Agent 做什么。"

    def run(self, ctx) -> dict:
        # ctx 已包含当前用户的 Twin、画像、资产、记忆
        assets = ctx.assets
        # ... 分析逻辑（务必提供不依赖 LLM 的本地降级路径）
        return {
            "summary": "结论摘要",
            "findings": [...],
            "suggestions": [...],
            "tier": "local",
        }
```

注册表会自动发现新插件，无需手动注册。

## 5. RAG 知识检索

### 5.1 流程

```
文档上传 / 手动录入
        │
        ▼
[切片] 按语义边界分块
        │
        ▼
[embedding] backend/services/rag/embeddings.py
        │      有 LLM → 调用 embedding 接口
        │      无 LLM → 本地确定性向量化降级
        ▼
[入库] knowledge_chunks（vector 存 JSON 数组）
        │
        ═══════════════════════════════
        │
用户提问
        ▼
[向量化] 问题 → 向量
        ▼
[检索] 余弦相似度 Top-K（强制 user_id 过滤）
        ▼
[可选] 拼接上下文 → LLM 生成回答
        ▼
返回答案 + 引用来源
```

### 5.2 端点

| 端点 | 功能 |
|---|---|
| `POST /api/rag/ingest` | 入库知识切片 |
| `POST /api/rag/query` | 检索 + 可选 LLM 作答 |
| `GET /api/rag/chunks` | 列出本人切片 |
| `DELETE /api/rag/chunks/{chunk_id}` | 删除切片 |

知识切片严格按 `user_id` 隔离，不存在跨用户检索。

## 6. 多模态摄入

`backend/multimodal/` 统一处理四类输入：

| 模态 | 入口 | 处理 |
|---|---|---|
| 文本 | `POST /api/multimodal/text` | 直接解析财富信息 |
| 图片 | `POST /api/multimodal/upload` | OCR / 视觉模型识别 |
| 文件 | `POST /api/multimodal/upload` | 按类型解析（PDF / Excel / CSV） |
| 语音 | `POST /api/multimodal/speech` | Web Speech 转写后走文本链路 |

`GET /api/multimodal/capabilities` 会探测当前环境可用的依赖，前端据此决定展示哪些入口，避免点了报错。

### 6.1 确认闭环（关键设计）

```
识别 ──▶ ExtractionResult(status="needs_confirm", applied=False)
              │
              ├── 用户确认 ──▶ 写入 assets/transactions
              │                applied=True, applied_ref=<新记录 id>
              │
              └── 用户拒绝 ──▶ status="rejected"，不产生任何财务数据
```

**AI 永远不会自动改动用户的财务数据。** 这是不可协商的设计红线。

## 7. 智能自动化中的 AI

`backend/autonomous/` 的 AI 使用受严格约束：

| 机制 | 说明 |
|---|---|
| **成本护栏** | `cost_guard` 模块限制每日 LLM 调用预算（默认 20 次），超限自动降级 `tier="local"` |
| **事件驱动** | 快照对比（`automation_snapshots`）检测指标变化，仅在真正有变化时才触发 AI 分析 |
| **冷却期** | 规则配置 `cooldown_seconds`（默认 3600），防止频繁触发 |
| **行情熔断** | 市场 Provider 链失败达阈值后熔断，降级为确定性本地估算 |
| **偏好学习** | 用户对行动项的反馈（完成/忽略/延期）实时更新 `automation_preferences`，影响后续推荐 |

自动化专属 Agent：`investment`、`cashflow`、`preference`（偏好学习）。

## 8. 报告生成

`backend/report/` 基于 Twin + 智能引擎结果生成结构化财富报告：

| 能力 | 说明 |
|---|---|
| 模板种类 | `GET /api/reports/kinds` 返回（月报、季报、专项等） |
| 内容格式 | Markdown 存于 `wealth_reports.content` |
| 导出 | `GET /api/reports/{id}/export?format=markdown\|html\|pdf` |
| 降级 | 无 LLM 时使用模板化本地生成，`tier="local"` |

## 9. 长期记忆

两套记忆体系并存：

| 系统 | 表 | 用途 |
|---|---|---|
| 基础记忆 | `memories` | 简单事实记录（`memory_type` + `content`） |
| 长期记忆 2.0 | `long_term_memories` | 带 `kind` / `key` / `importance` / `hit_count`，同 `key` 覆盖更新，支持重要性排序与命中统计 |
| 个人 OS 记忆 | `personal_os` 记忆中心 | 用户可视化管理的记忆条目 |

`POST /api/intelligence/memories/sync` 可从用户档案自动沉淀记忆。用户可通过隐私中心一键清空全部 AI 记忆。

---

**免责声明**：FinOS AI 提供信息分析和辅助决策，不构成投资建议。
