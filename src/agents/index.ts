import "server-only";

import type { BaseAgent, AIServiceLike } from "./base";
import { aiService } from "../ai/gateway/AIService";
import { CashFlowAgent } from "./cashflowAgent";
import { InvestmentAgent } from "./investmentAgent";
import { RiskAgent } from "./riskAgent";
import { RetirementAgent } from "./retirementAgent";
import { StrategyAgent } from "./strategyAgent";
import { SummaryAgent } from "./summaryAgent";

const registry: Record<string, () => BaseAgent> = {
  cashflow: () => new CashFlowAgent(),
  investment: () => new InvestmentAgent(),
  risk: () => new RiskAgent(),
  retirement: () => new RetirementAgent(),
  strategy: () => new StrategyAgent(),
  summary: () => new SummaryAgent(),
};

export function getAgent(id: string, ai: AIServiceLike = aiService): BaseAgent {
  const factory = registry[id];
  if (!factory) {
    throw new Error(`[agents] unknown agent id: ${id}`);
  }
  const agent = factory();
  if (ai) {
    (agent as unknown as { ai: AIServiceLike }).ai = ai;
  }
  return agent;
}

export function getAgentOrNull(id: string, ai?: AIServiceLike): BaseAgent | null {
  return id in registry ? getAgent(id, ai) : null;
}

export function getAllAgents(ai?: AIServiceLike): BaseAgent[] {
  return Object.keys(registry).map((k) => getAgent(k, ai));
}

export * from "./base";
