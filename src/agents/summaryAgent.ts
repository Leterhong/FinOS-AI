import { BaseAgent } from "./base";
import { getPrompt } from "../ai/prompts";
import type { TaskType } from "../ai/types";

/**
 * Summary Agent — synthesizes all prior agent results into an executive summary
 * and actionable recommendations. Routes via ModelRouter as "summarization".
 */
export class SummaryAgent extends BaseAgent {
  id = "summary";
  name = "综合总结 Agent";
  description = "将各专项智能体结论综合为高层执行摘要";
  systemPrompt = getPrompt("summary");
  taskType: TaskType = "summarization";
  protected temperature = 0.4;
}
