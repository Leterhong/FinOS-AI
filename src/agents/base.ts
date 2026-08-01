import "server-only";

import type {
  AIMessage,
  AIResponse,
  AgentAnalysisOutput,
  FinancialContextData,
  TaskType,
} from "../ai/types";
import { aiService } from "../ai/gateway/AIService";
import { financialRetriever } from "../knowledge/retriever";
import type { KnowledgeContext } from "../knowledge/types";
import type { ToolContext } from "../ai/tools/types";

export interface AgentAnalyzeOptions {
  /** Prior agent results, used by synthesis agents (e.g. Summary). */
  previousResults?: AgentAnalysisOutput[];
  /** The specific sub-question / task description for this run. */
  taskDescription?: string;
  /** 用户原始问题：用于 RAG 检索查询构造（Phase 3.3）。 */
  userQuestion?: string;
  /** 实时金融工具数据上下文（Phase 3.4 Tool Calling）：由 ToolRouter 注入。 */
  toolContext?: ToolContext | null;
  /** Phase 6.6：用户 id —— RAG 同时检索该用户的私人知识库（严格隔离）。 */
  userId?: string;
  /** Phase 6.6：用户长期记忆上下文（由 Memory Retriever 注入，禁止虚构）。 */
  memoryContext?: string;
}

/**
 * Minimal AIService surface required by agents. Declaring it as an interface lets
 * callers inject a stub (e.g. in tests) without pulling the real network gateway.
 */
export interface AIServiceLike {
  generate(
    messages: AIMessage[],
    options?: {
      taskType?: TaskType;
      temperature?: number;
      maxTokens?: number;
      responseFormat?: "text" | "json";
      provider?: string;
      model?: string;
      signal?: AbortSignal;
      /** Phase 5.9.1：发起调用的智能体中文名，用于用量审计（spec #9）。 */
      agentName?: string;
    }
  ): Promise<AIResponse>;
}

/**
 * 统一的金融智能体接口（Phase 3.2）。
 * 所有专项智能体（现金流 / 投资 / 风险 / 退休 / 财富策略 / 综合总结）均实现此接口。
 * 调用链始终为：Agent → AIService → ModelRouter → Provider → LLM，密钥只在服务端读取。
 */
export interface FinancialAgent {
  /** 稳定标识，用于注册表与事件路由，例如 "cashflow"。 */
  id: string;
  /** 中文展示名，例如 "现金流分析 Agent"。 */
  name: string;
  /** 中文职责描述，用于规划与可视化。 */
  description: string;
  /**
   * 基于金融上下文执行分析，调用 LLM 并返回结构化结果。
   * @param context  FinancialContextData（用户画像 + 衍生指标 + 历史）
   * @param options  前序结果、子任务描述等
   */
  analyze(
    context: FinancialContextData,
    options?: AgentAnalyzeOptions
  ): Promise<AgentAnalysisOutput>;
}

/**
 * 真实金融分析约束（Phase 3.2）：附加到每个智能体的系统提示。
 * 确保所有面向用户的输出都遵守合规要求 —— 不做收益承诺、不荐股、必须给出
 * 分析 / 风险 / 建议 / 假设条件。
 */
const REAL_ANALYSIS_DIRECTIVE = `

【合规与分析约束】
你是一位谨慎的个人财富顾问，不是收益承诺方。请严格遵守：
1. 禁止承诺任何收益、回报率或保本结果；任何预测都必须标注为"假设情景"。
2. 禁止直接推荐买卖某一只具体股票；只能给出配置原则与大类资产层面的建议。
3. 必须输出：分析结论、主要风险、可执行建议，以及所依赖的关键假设条件。
4. 所有面向用户的输出使用简体中文。`;

/**
 * 全局语言指令：确保所有面向用户的 LLM 输出默认使用简体中文。
 * 即使某个 Prompt 遗漏了语言要求，此处也会强制约束输出语言。
 */
const CHINESE_OUTPUT_DIRECTIVE =
  "\n\n【语言要求】所有面向用户的输出（headline、bullets、metrics 的 label 与 value 等）必须使用简体中文。";

/**
 * 金融免责声明（Phase 3.3）：附加到所有智能体系统提示，
 * 同时导出给 UI 层在报告底部展示。
 */
export const FINANCIAL_DISCLAIMER =
  "以上内容为基于用户数据与金融知识库的分析意见与教育信息，不构成投资建议，不保证任何收益。市场有风险，决策需谨慎。";

const DISCLAIMER_DIRECTIVE = `

【免责声明约束】
你输出的是分析意见、风险提示与教育信息，不是投资建议。禁止保证收益，禁止给出明确的个股/个券买卖指令。`;

/**
 * 实时工具数据约束（Phase 3.4 Tool Calling）：
 * 模型只能引用 Tool Router 真实返回的外部金融工具数据，不得编造数字。
 */
const TOOL_DIRECTIVE = `

【实时工具数据约束】
用户消息中可能包含 "实时金融工具数据"（由外部 API 真实返回）。请基于这些真实数据进行分析并引用具体数值；若工具未提供某项数据，明确说明"暂无工具数据"，禁止猜测或编造任何未提供的行情、净值或宏观数字。`;

/**
 * 知识引用约束（Phase 3.3 RAG）：
 * 模型只能参考服务端注入的知识片段，来源列表由服务端根据真实检索结果生成，
 * 不允许模型自行编造"参考来源"。
 */
const KNOWLEDGE_DIRECTIVE = `
【知识使用约束】
用户消息中可能包含 "Knowledge Context"（金融知识片段）。请结合用户财务数据与这些知识进行分析；若知识片段与用户情况冲突，以用户真实数据为准。禁止在输出中虚构任何未提供的知识来源或文献引用。`;

/**
 * 子 agent 可能返回各种标量字段（score / riskScore / targetAge / gap ...），
 * 这里统一映射成中文 metric 标签，便于在卡片中展示。
 */
const SCALAR_LABELS: Record<string, string> = {
  score: "健康评分",
  healthScore: "健康评分",
  riskScore: "风险评分",
  savingsRate: "储蓄率",
  targetAge: "目标退休年龄",
  estimatedAge: "预计退休年龄",
  estimatedRetireAge: "预计退休年龄",
  retirementAge: "退休年龄",
  gap: "资金缺口(元)",
  netWorth: "净资产(元)",
  riskLevel: "风险等级",
  allocation: "建议配置",
};

export abstract class BaseAgent implements FinancialAgent {
  abstract id: string;
  abstract name: string;
  abstract description: string;
  abstract systemPrompt: string;
  abstract taskType: TaskType;

  protected ai: AIServiceLike;
  protected temperature = 0.3;
  protected maxTokens = 4096;

  constructor(ai: AIServiceLike = aiService) {
    this.ai = ai;
  }

  /**
   * Run the agent against the provided financial context.
   * Call chain（Phase 3.3）:
   *   Agent → Context Builder → Retriever → Knowledge Context
   *         → AIService → ModelRouter → Provider → LLM
   */
  async analyze(
    context: FinancialContextData,
    options: AgentAnalyzeOptions = {}
  ): Promise<AgentAnalysisOutput> {
    // ── RAG：为本 Agent 检索金融知识（公共库 + 个人库）──────────────
    const knowledge = await this.retrieveKnowledge(options);

    const messages = this.buildMessages(context, options, knowledge);
    const response = await this.ai.generate(messages, {
      taskType: this.taskType,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      responseFormat: "json",
      agentName: this.name,
    });
    const output = this.parse(response.content);
    // 来源由服务端根据真实检索命中注入 —— 不采信模型自行生成的来源
    if (knowledge && knowledge.sources.length > 0) {
      output.sources = knowledge.sources;
    }
    return output;
  }

  /** 检索知识上下文；检索失败不阻塞分析（RAG 是增强，不是硬依赖）。 */
  protected async retrieveKnowledge(
    options: AgentAnalyzeOptions
  ): Promise<KnowledgeContext | null> {
    try {
      const knowledge = await financialRetriever.retrieveForAgent({
        agentId: this.id,
        question: options.userQuestion ?? options.taskDescription,
        // Phase 6.6：带上 userId，公共知识库 + 用户私人知识库双空间检索
        userId: options.userId,
      });
      return knowledge.chunks.length > 0 ? knowledge : null;
    } catch {
      return null;
    }
  }

  protected buildMessages(
    context: FinancialContextData,
    options: AgentAnalyzeOptions,
    knowledge?: KnowledgeContext | null
  ): AIMessage[] {
    return [
      {
        role: "system",
        content:
          this.systemPrompt +
          CHINESE_OUTPUT_DIRECTIVE +
          REAL_ANALYSIS_DIRECTIVE +
          TOOL_DIRECTIVE +
          KNOWLEDGE_DIRECTIVE +
          DISCLAIMER_DIRECTIVE,
      },
      { role: "user", content: this.buildUserContent(context, options, knowledge) },
    ];
  }

  protected buildUserContent(
    context: FinancialContextData,
    options: AgentAnalyzeOptions,
    knowledge?: KnowledgeContext | null
  ): string {
    let content = `## Financial Context\n\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\``;
    if (options.taskDescription) {
      content = `## Task\n${options.taskDescription}\n\n${content}`;
    }
    if (knowledge && knowledge.text) {
      content +=
        `\n\n## Knowledge Context\n你可以参考以下金融知识：\n\n${knowledge.text}\n\n` +
        `请结合用户情况进行分析，不要照抄知识原文。`;
    }
    // Phase 6.6：用户长期记忆 —— 让 AI CFO 记得用户是谁、目标是什么
    if (options.memoryContext) {
      content +=
        `\n\n## User Long-term Memory\n${options.memoryContext}\n\n` +
        `请让分析与建议与用户的长期目标、画像保持一致与连续；如与最新财务数据冲突，以最新数据为准。`;
    }
    if (options.toolContext && options.toolContext.text) {
      content +=
        `\n\n## 实时金融工具数据（Tool Calling）\n${options.toolContext.text}\n\n` +
        `请结合上述真实工具数据进行分析，引用具体数值。`;
    }
    if (options.previousResults && options.previousResults.length > 0) {
      content +=
        `\n\n## Previous Agent Results\n\`\`\`json\n${JSON.stringify(
          options.previousResults,
          null,
          2
        )}\n\`\`\``;
    }
    return content;
  }

  /**
   * Parse the LLM JSON into a structured result. No deterministic fallback — if the
   * model output is unparseable we surface an explicit error placeholder so the UI
   * reflects a genuine failure rather than a fabricated answer.
   *
   * 兼容各子 Agent 的不同字段契约：
   *  - headline 优先取 summary，其次 headline / plan
   *  - bullets 收集任何列表型分析字段（issues/recommendations/riskFactors/solutions/priorityActions/nextSteps ...）
   *  - metrics 优先取显式 metrics 数组，否则从已知标量字段映射
   */
  protected parse(raw: string): AgentAnalysisOutput {
    const parsed = safeJsonParse(raw);
    if (!parsed) return this.errorResult(raw);

    const headline = String(
      parsed.summary ?? parsed.headline ?? parsed.plan ?? "分析完成"
    );

    // ── Bullets：收集所有列表型分析字段 ──
    const bulletFields: unknown[] = [
      parsed.bullets,
      parsed.insights,
      parsed.issues,
      parsed.recommendations,
      parsed.recommendation,
      parsed.riskFactors,
      parsed.solutions,
      parsed.priorityActions,
      parsed.nextSteps,
      parsed.keyPoints,
    ];
    const bullets: string[] = [];
    for (const f of bulletFields) {
      if (Array.isArray(f)) bullets.push(...f.map(String));
      else if (typeof f === "string" && f) bullets.push(f);
    }

    // ── Metrics：显式数组优先，否则从标量字段映射 ──
    const metrics: { label: string; value: string; tone?: "good" | "warn" | "risk" }[] = [];
    if (Array.isArray(parsed.metrics)) {
      for (const m of parsed.metrics as Record<string, unknown>[]) {
        metrics.push({
          label: String(m.label ?? ""),
          value: String(m.value ?? ""),
          tone: toTone(m.tone),
        });
      }
    } else {
      for (const [key, label] of Object.entries(SCALAR_LABELS)) {
        const v = parsed[key];
        if (v === undefined || v === null || v === "") continue;
        metrics.push({ label, value: String(v) });
      }
    }

    const confidence =
      typeof parsed.confidence === "number" ? parsed.confidence : 0.85;

    return {
      agentId: this.id,
      headline,
      bullets: bullets.length ? bullets : [headline],
      metrics,
      confidence,
      rawContent: raw,
    };
  }

  private errorResult(raw: string): AgentAnalysisOutput {
    return {
      agentId: this.id,
      headline: "分析未完成",
      bullets: ["模型未返回可解析的 JSON 结果。请检查 LLM Provider 配置后重试。"],
      metrics: [],
      confidence: 0,
      rawContent: raw,
    };
  }
}

function safeJsonParse(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  let text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) text = fenced[1].trim();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toTone(value: unknown): "good" | "warn" | "risk" | undefined {
  return value === "good" || value === "warn" || value === "risk" ? value : undefined;
}
