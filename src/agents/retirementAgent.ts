import { BaseAgent } from "./base";
import { getPrompt } from "../ai/prompts";
import type { TaskType } from "../ai/types";

/**
 * Retirement Agent — projects wealth trajectory, retirement readiness and gaps.
 * Routes via ModelRouter as "reasoning".
 */
export class RetirementAgent extends BaseAgent {
  id = "retirement";
  name = "退休规划 Agent";
  description = "推演财富轨迹、退休准备度与目标缺口";
  systemPrompt = getPrompt("retirement");
  taskType: TaskType = "reasoning";
}
