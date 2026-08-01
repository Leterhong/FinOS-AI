import { BaseAgent } from "./base";
import { getPrompt } from "../ai/prompts";
import type { TaskType } from "../ai/types";

/**
 * Risk Agent — assesses debt, leverage, portfolio concentration and downside risk.
 * Routes via ModelRouter as "reasoning" (step-by-step risk reasoning).
 */
export class RiskAgent extends BaseAgent {
  id = "risk";
  name = "风险评估 Agent";
  description = "评估负债、现金流与资产集中度等风险维度";
  systemPrompt = getPrompt("risk");
  taskType: TaskType = "reasoning";
}
