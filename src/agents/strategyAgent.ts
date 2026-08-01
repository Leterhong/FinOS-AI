import { BaseAgent } from "./base";
import { getPrompt } from "../ai/prompts";
import type { TaskType } from "../ai/types";

/**
 * Strategy Agent — 综合现金流 / 投资 / 风险 / 退休四个专项智能体的结论，
 * 生成一份年度财富行动计划（优先级行动 + 中长期步骤）。
 * 路由 via ModelRouter as "summarization"。
 */
export class StrategyAgent extends BaseAgent {
  id = "strategy";
  name = "财富策略 Agent";
  description = "综合现金流、投资、风险与退休分析，生成年度财富行动计划";
  systemPrompt = getPrompt("strategy");
  taskType: TaskType = "summarization";
  protected temperature = 0.4;
}
