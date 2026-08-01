// ── Core AI Types ──────────────────────────────────────────────────────────
// All LLM-facing types live here. No UI types. No data types from src/data.

export type TaskType =
  | "reasoning"
  | "writing"
  | "vision"
  | "long-context"
  | "analysis"
  | "summarization"
  | "extraction"
  | "planning";

export type ModelCapability =
  | "chat"
  | "vision"
  | "function-calling"
  | "streaming"
  | "long-context"
  | "json-mode";

export type ProviderId =
  | "openai"
  | "claude"
  | "gemini"
  | "deepseek"
  | "qwen"
  | "seed"
  // 动态用户模型（Phase 5.5 Model Center）—— baseUrl/apiKey/modelId 来自用户配置。
  | "user";

export interface ModelConfig {
  id: string;
  name: string;
  provider: ProviderId;
  contextWindow: number;
  maxOutputTokens: number;
  capabilities: ModelCapability[];
  strengths: TaskType[];
  costPer1kInput: number;
  costPer1kOutput: number;
}

/** 多模态内容分片（OpenAI chat/completions 兼容格式，Phase 6.7） */
export type AIContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface AIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /**
   * 多模态分片（可选）。存在时 Provider 优先发送 parts（图片+文本），
   * content 仍保留纯文本摘要用于日志 / 降级。
   */
  parts?: AIContentPart[];
  name?: string;
  toolCallId?: string;
}

export interface AIRequest {
  messages: AIMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  responseFormat?: "text" | "json";
  tools?: AITool[];
  signal?: AbortSignal;
}

export interface AIResponse {
  content: string;
  model: string;
  provider: ProviderId;
  usage: TokenUsage;
  finishReason: "stop" | "length" | "tool-calls" | "error";
  latencyMs: number;
}

export interface AIStreamChunk {
  content: string;
  done: boolean;
  model?: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AITool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// ── Provider Interface ─────────────────────────────────────────────────────

export interface Provider {
  id: ProviderId;
  generate(request: AIRequest): Promise<AIResponse>;
  stream?(request: AIRequest): AsyncIterable<AIStreamChunk>;
  embed?(texts: string[]): Promise<number[][]>;
}

// ── Goal Types ─────────────────────────────────────────────────────────────

export type GoalType =
  | "retirement"
  | "house-planning"
  | "income-optimization"
  | "investment-allocation"
  | "risk-assessment"
  | "cashflow-analysis"
  | "debt-management"
  | "insurance-planning"
  | "tax-planning"
  | "general-question";

export interface RecognizedGoal {
  type: GoalType;
  label: string;
  confidence: number;
  entities: Record<string, string | number>;
  followUpQuestions: string[];
}

// ── Task & Workflow Types ─────────────────────────────────────────────────

export type TaskStatus = "pending" | "planning" | "running" | "done" | "failed";

export interface AITask {
  id: string;
  goalType: GoalType;
  description: string;
  taskType: TaskType;
  assignedAgent: string;
  status: TaskStatus;
  result?: AgentAnalysisOutput;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

/** 知识来源引用（Phase 3.3 RAG）：只允许来自真实检索命中，禁止虚构。 */
export interface KnowledgeSource {
  /** 文档标题，例如 "投资风险管理知识库"。 */
  title: string;
  /** 分类中文名，例如 "投资知识"。 */
  category: string;
  /** global = 公共金融知识；personal = 用户个人资料。 */
  scope: "global" | "personal";
}

export interface AgentAnalysisOutput {
  agentId: string;
  headline: string;
  bullets: string[];
  metrics: { label: string; value: string; tone?: "good" | "warn" | "risk" }[];
  confidence: number;
  rawContent?: string;
  /** 本次分析实际参考的知识来源（RAG 检索命中，服务端注入，非模型生成）。 */
  sources?: KnowledgeSource[];
}

export type WorkflowPhase =
  | "idle"
  | "recognizing-goal"
  | "planning"
  | "executing"
  | "summarizing"
  | "complete"
  | "failed";

export interface WorkflowState {
  id: string;
  phase: WorkflowPhase;
  goal?: RecognizedGoal;
  tasks: AITask[];
  results: AgentAnalysisOutput[];
  summary?: AgentAnalysisOutput;
  /** Phase 6：本次分析是否注入了用户真实金融数据（流水/持仓） */
  usedRealData?: boolean;
  startedAt: number;
  completedAt?: number;
  error?: string;
}

// ── Chat Intent Routing (Phase 5.9.6) ────────────────────────────────────
/**
 * AI CFO 对话意图分类。用户输入先经 Intent Router 分流，
 * 仅 `financial_analysis` 会触发完整财富分析工作流；其余意图直达轻量回复。
 */
export type ChatIntent =
  | "greeting" // 问候 / 身份询问（你好 / 你是谁）
  | "model_info" // 询问当前 AI 模型
  | "financial_analysis" // 基于用户真实数据的财富分析 / 规划
  | "profile_update" // 修改个人财富画像字段
  | "general_question"; // 通用金融知识科普（不引用个人数据）

// ── Streaming Workflow Events (Server → Client, via SSE) ──────────────────

/**
 * 服务端工作流在运行期间逐步推送的事件，由客户端 SSE 读取后映射到状态更新。
 * 这样 AI 执行完全留在服务端，浏览器只消费结果。
 */
export type WorkflowEvent =
  | { type: "phase"; phase: WorkflowPhase }
  | { type: "goal"; goal: RecognizedGoal }
  | { type: "tasks"; tasks: AITask[] }
  | { type: "task-start"; task: AITask }
  | { type: "task-complete"; task: AITask; result: AgentAnalysisOutput }
  | { type: "summary"; summary: AgentAnalysisOutput }
  | { type: "tool-calls"; records: import("../tools/types").ToolCallRecord[] }
  | { type: "twin-update"; snapshot: import("@/twin/engine").TwinSnapshot }
  | { type: "task-create"; tasks: import("@/wealth/tasks").WealthTask[] }
  | { type: "done"; state: WorkflowState }
  | { type: "error"; message: string }
  // Phase 5.9.6：轻量直达回复（greeting / model_info / general_question / profile_update 提示），
  // 不经过财富分析工作流，避免任何问题默认触发财务分析。
  | { type: "direct-reply"; intent: ChatIntent; content: string };

// ── Context Types ─────────────────────────────────────────────────────────

export interface FinancialContextData {
  // Raw profile snapshot
  profile: {
    name: string;
    age: number;
    monthlyIncome: number;
    monthlyExpenses: number;
    monthlyInvestment: number;
    totalAssets: number;
    liabilities: number;
    cashSavings: number;
    stockPortfolio: number;
    realEstate: number;
    bonds: number;
    crypto: number;
    funds: number;
    house: number;
    insurance: number;
    riskLevel: string;
    retirementAge: number;
    targetAmount: number;
  };
  // Derived metrics
  metrics: {
    netWorth: number;
    savingsRate: number;
    debtToIncome: number;
    emergencyFundMonths: number;
    projectedRetireAge: number;
    healthScore: number;
  };
  // Active scenarios
  activeEvents: string[];
  // Goals
  goals: { retirementAge: number; targetAmount: number }[];
  // Recent context
  recentQuestions?: string[];
  // 历史记忆（来自 Agent Memory）：用户历史目标与过往策略摘要
  history?: { goals: string[]; summary?: string; summaryAt?: number }[];
  // Phase 6：真实金融数据摘要（来自 Financial Data Layer，存在时 Agent 优先基于真实数据分析）
  realData?: {
    dateRange: { from: string; to: string } | null;
    transactionCount: number;
    avgMonthlyIncome: number;
    avgMonthlyExpense: number;
    avgSavingsRate: number;
    monthlyCashFlow: { month: string; income: number; expense: number; net: number; savingsRate: number }[];
    topCategories: { label: string; amount: number; ratio: number; count: number }[];
    holdings: { name: string; type: string; marketValue: number; profit?: number; returnRate?: number }[];
    totalInvestment: number;
    totalProfit: number;
    updatedAt: string | null;
  };
  // Phase 6.4：市场智能数据（来自 Market Intelligence Layer，受 market 授权作用域守卫）。
  // 存在时 Agent 必须结合市场状态与组合指标做数据驱动分析；simulated=true 时必须标注模拟数据。
  marketData?: {
    /** 市场连接状态：connected / cached / unavailable */
    status: string;
    /** 是否为模拟行情数据 */
    simulated: boolean;
    /** 一句话市场概览 */
    summary: string;
    /** 主要指数（点位 + 当日涨跌幅，小数：0.01=+1%） */
    indices: { code: string; name: string; value: number; changeRate: number }[];
    /** 组合量化分析（确定性纯函数计算；无持仓时缺省） */
    portfolio?: {
      totalValue: number;
      investedValue: number;
      /** 现金占比 0~1 */
      cashRatio: number;
      /** 资产类别配置 */
      byClass: { label: string; value: number; ratio: number }[];
      /** 行业配置 */
      bySector: { label: string; ratio: number }[];
      /** Top 持仓 */
      topHoldings: { name: string; ratio: number; returnRate?: number }[];
      /** 集中度：最大单只持仓占投资资产比例 + 等级 */
      concentration: { top1Ratio: number; level: string };
      /** 组合收益指标（数据不足为 null） */
      performance: {
        monthChange: number | null;
        annualizedReturn: number | null;
        volatility: number | null;
        maxDrawdown: number | null;
        riskReturnRatio: number | null;
      };
      /** 规则引擎风险评分 0~100（越高越危险）与信号 */
      riskScore: number;
      riskLevel: string;
      riskSignals: { type: string; severity: string; title: string; detail: string }[];
    };
    generatedAt: string;
  };
  timestamp: number;
}

export interface PromptContext {
  systemPrompt?: string;
  userPrompt: string;
  financialData?: FinancialContextData;
  taskContext?: Record<string, unknown>;
  previousResults?: AgentAnalysisOutput[];
}
