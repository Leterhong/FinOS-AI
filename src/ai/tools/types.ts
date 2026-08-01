// ── Tool Calling 类型（Phase 3.4 Real World Financial Intelligence Layer）──
// 注意：本文件为"纯类型 + 纯数据"，不含任何 server-only 代码，
// 因此浏览器侧（store / 组件）与服务端（router / tools）均可安全 import。

/** 单个金融工具的规范返回结果。 */
export interface ToolResult {
  /** 调用状态：成功 / 失败。 */
  status: "success" | "error";
  /** 人类可读的结果摘要（同时供 LLM 与 UI 使用）。 */
  summary: string;
  /** 结构化结果（任意形态，由工具自身约定；UI 仅展示 summary，不依赖此字段）。 */
  data?: unknown;
  /** 失败时的错误信息。 */
  error?: string;
}

/**
 * 统一的金融工具接口（Phase 3.4）。
 * 所有外部金融能力（行情 / 基金 / 宏观 / 新闻）都实现此接口，
 * 由 ToolRouter 负责在 Agent 任务中自动选择并调用。
 *
 * 第一阶段为 Mock Adapter 实现，但 execute 的入参 / 出参结构按真实 API 设计，
 * 未来把 Mock 替换为真实 HTTP 调用即可（见各工具文件中的"真实 API 接入点"注释）。
 */
export interface FinancialTool {
  /** 稳定标识，例如 "MarketDataTool"。 */
  name: string;
  /** 中文展示名，例如 "市场数据"。 */
  label: string;
  /** 能力描述（供 Agent / 路由理解何时调用）。 */
  description: string;
  /** 执行工具调用，返回规范结果。 */
  execute(params: Record<string, unknown>): Promise<ToolResult>;
}

/**
 * 一次工具调用的完整记录（用于 AI Tool Trace 展示与注入 LLM）。
 * 由 ToolRouter 在每次调用后生成，保证服务端真实产生、绝不虚构。
 */
export interface ToolCallRecord {
  /** 发起调用的智能体（例如 "risk" / "investment"）。 */
  agentId: string;
  /** 工具标识，例如 "MacroDataTool"。 */
  tool: string;
  /** 工具中文名，例如 "宏观经济数据"。 */
  toolLabel: string;
  /** 实际传入工具的查询参数（来自用户画像 / 问题）。 */
  params: Record<string, unknown>;
  /** 调用状态。 */
  status: "success" | "error";
  /** 人类可读的结果摘要（注入 LLM 与 UI）。 */
  summary: string;
  /** 耗时（毫秒）。 */
  durationMs: number;
  /** 调用时间戳。 */
  timestamp: number;
  /** 失败时的错误信息。 */
  error?: string;
}

/**
 * 注入 Agent Prompt 的工具上下文：格式化文本 + 原始记录列表。
 */
export interface ToolContext {
  /** 可直接拼接到用户消息的格式化文本（含各工具返回数据）。 */
  text: string;
  /** 对应的调用记录列表（供 Tool Trace 展示）。 */
  records: ToolCallRecord[];
}

// ── 模拟数据标记（Phase 7.9 合规基线）──────────────────────────────────────
// 唯一真源：服务端 mock-utils.ts 拼接摘要时复用此前缀，客户端组件据此
// 判断是否需要渲染「模拟数据」标识。放在本文件是因为它是客户端安全模块。

/** 模拟数据摘要前缀。修改此值会同时影响服务端拼接与前端识别。 */
export const SIMULATED_MARKER = "【模拟数据】";

/** 判断一批工具调用记录中是否含模拟数据（用于前端渲染合规标识）。 */
export function hasSimulatedToolData(records?: ToolCallRecord[]): boolean {
  return (records ?? []).some((r) => r.summary?.includes(SIMULATED_MARKER));
}
