import type { FinancialProfile } from "@/data/types";
import type { FinancialContextData, RecognizedGoal, AgentAnalysisOutput } from "../types";
import { computeCashFlow, computeRiskMetrics, computeProjection } from "@/scenario/scenario-engine";
import { findRetirementAge } from "@/lib/simulationEngine";

interface BuildContextOptions {
  profile: FinancialProfile;
  activeEvents: string[];
  goal?: RecognizedGoal;
  recentQuestions?: string[];
  previousResults?: AgentAnalysisOutput[];
  history?: { goals: string[]; summary?: string; summaryAt?: number }[];
  /** Phase 6：真实金融数据摘要（存在时 Agent 优先基于真实数据分析） */
  realData?: FinancialContextData["realData"];
  /** Phase 6.4：市场智能数据（受 market 授权作用域守卫，存在时 Agent 必须数据驱动分析） */
  marketData?: FinancialContextData["marketData"];
}

class ContextBuilder {
  /**
   * Build a unified financial context snapshot from the global store.
   * All agents receive this same context shape — no direct store access.
   */
  buildFinancialData(opts: BuildContextOptions): FinancialContextData {
    const { profile, activeEvents, recentQuestions, history, realData, marketData } = opts;

    const cashFlow = computeCashFlow(profile);
    const riskMetrics = computeRiskMetrics(profile);
    const projection = computeProjection(profile);
    const projectedRetireAge = findRetirementAge(projection, profile.goal.targetAmount);

    const totalAssets =
      profile.cashSavings +
      profile.stockPortfolio +
      profile.realEstate +
      profile.bonds +
      profile.crypto +
      (profile.funds ?? 0) +
      (profile.house ?? 0) +
      (profile.insurance ?? 0);

    const netWorth = totalAssets - profile.liabilities;
    const debtToIncome = cashFlow.income > 0
      ? (profile.liabilities / (cashFlow.income * 12)) * 100
      : 0;
    const emergencyFundMonths = cashFlow.expenses > 0
      ? profile.cashSavings / cashFlow.expenses
      : 0;

    return {
      profile: {
        name: profile.name,
        age: profile.age,
        monthlyIncome: cashFlow.income,
        monthlyExpenses: cashFlow.expenses,
        monthlyInvestment: profile.monthlyInvestment + profile.modifiers.extraInvestment,
        totalAssets,
        liabilities: profile.liabilities,
        cashSavings: profile.cashSavings,
        stockPortfolio: profile.stockPortfolio,
        realEstate: profile.realEstate,
        bonds: profile.bonds,
        crypto: profile.crypto,
        funds: profile.funds ?? 0,
        house: profile.house ?? 0,
        insurance: profile.insurance ?? 0,
        riskLevel: profile.riskLevel,
        retirementAge: profile.goal.retirementAge,
        targetAmount: profile.goal.targetAmount,
      },
      metrics: {
        netWorth,
        savingsRate: cashFlow.savingsRate,
        debtToIncome,
        emergencyFundMonths,
        projectedRetireAge,
        healthScore: riskMetrics.overall,
      },
      activeEvents: [...activeEvents],
      goals: [{
        retirementAge: profile.goal.retirementAge,
        targetAmount: profile.goal.targetAmount,
      }],
      recentQuestions,
      history: history ?? [],
      realData,
      marketData,
      timestamp: Date.now(),
    };
  }

  /**
   * Format context as a compact JSON string for injection into prompts.
   */
  toPromptContext(contextData: FinancialContextData): string {
    return JSON.stringify(contextData, null, 2);
  }

  /**
   * Build the full message array for an AI call:
   * system prompt + user prompt with embedded financial data.
   */
  buildMessages(
    systemPrompt: string,
    userQuestion: string,
    contextData: FinancialContextData,
    previousResults?: AgentAnalysisOutput[]
  ): { role: "system" | "user" | "assistant"; content: string }[] {
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content:
          `## User Question\n${userQuestion}\n\n` +
          `## Financial Context\n\`\`\`json\n${this.toPromptContext(contextData)}\n\`\`\`\n\n` +
          (previousResults && previousResults.length > 0
            ? `## Previous Agent Results\n\`\`\`json\n${JSON.stringify(previousResults, null, 2)}\n\`\`\``
            : ""),
      },
    ];
    return messages;
  }
}

export const contextBuilder = new ContextBuilder();
