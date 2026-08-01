import { BaseAgent } from "./base";
import { getPrompt } from "../ai/prompts";
import type { TaskType } from "../ai/types";

/**
 * Investment Agent — evaluates portfolio allocation, diversification and
 * long-term growth potential. Routes via ModelRouter as "analysis".
 */
export class InvestmentAgent extends BaseAgent {
  id = "investment";
  name = "投资规划 Agent";
  description = "分析资产配置、风险偏好匹配度与再平衡建议";
  systemPrompt = getPrompt("investment");
  taskType: TaskType = "analysis";
}
