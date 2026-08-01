import { cashflowPrompt } from "./cashflow";
import { investmentPrompt } from "./investment";
import { riskPrompt } from "./risk";
import { retirementPrompt } from "./retirement";
import { summaryPrompt } from "./summary";
import { strategyPrompt } from "./strategy";
import { plannerPrompt } from "./planner";

export type AgentPromptId =
  | "cashflow"
  | "investment"
  | "risk"
  | "retirement"
  | "strategy"
  | "summary"
  | "planner";

const prompts: Record<AgentPromptId, string> = {
  cashflow: cashflowPrompt,
  investment: investmentPrompt,
  risk: riskPrompt,
  retirement: retirementPrompt,
  strategy: strategyPrompt,
  summary: summaryPrompt,
  planner: plannerPrompt,
};

export function getPrompt(id: AgentPromptId): string {
  return prompts[id];
}

export function getAllPrompts(): Record<AgentPromptId, string> {
  return { ...prompts };
}
