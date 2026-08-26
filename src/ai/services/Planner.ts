import "server-only";

import { aiService } from "../gateway/AIService";
import { getPrompt } from "../prompts";
import { contextBuilder } from "../context/ContextBuilder";
import type { FinancialProfile } from "@/data/types";
import type { AITask, RecognizedGoal, TaskType } from "../types";

interface PlanOptions {
  profile: FinancialProfile;
  activeEvents: string[];
  goal: RecognizedGoal;
  userQuestion: string;
}

// ── Rule-based planner fallback (used when the LLM plan is unavailable) ──

const goalTaskMap: Record<string, { agent: string; description: string; taskType: TaskType }[]> = {
  retirement: [
    { agent: "cashflow", description: "Analyze current savings rate and capacity for increased retirement contributions", taskType: "analysis" },
    { agent: "investment", description: "Evaluate portfolio allocation for optimal long-term growth toward retirement target", taskType: "analysis" },
    { agent: "risk", description: "Assess risk exposure and sequence-of-returns risk leading into retirement", taskType: "reasoning" },
    { agent: "retirement", description: "Project wealth trajectory to determine retirement age and identify gaps", taskType: "reasoning" },
  ],
  "house-planning": [
    { agent: "cashflow", description: "Analyze impact of down payment and mortgage on monthly cash flow", taskType: "analysis" },
    { agent: "risk", description: "Evaluate debt ratio and emergency fund adequacy after property purchase", taskType: "analysis" },
    { agent: "investment", description: "Assess how capital reallocation to property affects long-term returns", taskType: "reasoning" },
    { agent: "retirement", description: "Project how mortgage obligations affect retirement timeline", taskType: "reasoning" },
  ],
  "income-optimization": [
    { agent: "cashflow", description: "Analyze current income vs expenses and identify optimization opportunities", taskType: "analysis" },
    { agent: "investment", description: "Evaluate how increased income can be optimally allocated to investments", taskType: "analysis" },
    { agent: "retirement", description: "Project retirement acceleration from income growth scenarios", taskType: "reasoning" },
  ],
  "investment-allocation": [
    { agent: "investment", description: "Analyze current portfolio allocation and recommend rebalancing", taskType: "analysis" },
    { agent: "risk", description: "Assess risk-adjusted returns and diversification", taskType: "analysis" },
    { agent: "retirement", description: "Project how allocation changes affect long-term trajectory", taskType: "reasoning" },
  ],
  "risk-assessment": [
    { agent: "risk", description: "Comprehensive risk assessment across debt, portfolio, and cash flow dimensions", taskType: "reasoning" },
    { agent: "cashflow", description: "Analyze emergency fund and income stability", taskType: "analysis" },
    { agent: "investment", description: "Evaluate portfolio concentration and downside risk", taskType: "analysis" },
  ],
  "cashflow-analysis": [
    { agent: "cashflow", description: "Deep dive into income, expenses, and savings rate", taskType: "analysis" },
    { agent: "risk", description: "Assess cash flow stability and emergency fund", taskType: "analysis" },
  ],
  "debt-management": [
    { agent: "cashflow", description: "Analyze debt service ratio relative to income", taskType: "analysis" },
    { agent: "risk", description: "Evaluate leverage risk and repayment strategy", taskType: "reasoning" },
  ],
  "insurance-planning": [
    { agent: "risk", description: "Assess insurance needs based on profile and dependents", taskType: "analysis" },
    { agent: "cashflow", description: "Analyze premium affordability within budget", taskType: "analysis" },
  ],
  "tax-planning": [
    { agent: "cashflow", description: "Analyze tax-advantaged account utilization", taskType: "analysis" },
    { agent: "investment", description: "Evaluate tax-efficient investment strategies", taskType: "analysis" },
  ],
  "general-question": [
    { agent: "cashflow", description: "Analyze overall cash flow health", taskType: "analysis" },
    { agent: "investment", description: "Review portfolio allocation", taskType: "analysis" },
    { agent: "risk", description: "Assess financial risk profile", taskType: "analysis" },
    { agent: "retirement", description: "Review retirement readiness", taskType: "reasoning" },
  ],
};

class Planner {
  /**
   * Generate a task list for the given goal.
   * Uses the LLM-generated plan when available; otherwise falls back to rule-based planning.
   */
  async plan(opts: PlanOptions): Promise<AITask[]> {
    const { goal, userQuestion } = opts;

    // Try LLM planning first; fall back to rules on failure
    try {
      return await this.planWithAI(opts);
    } catch {
      // Fallback to rule-based
      return this.planWithRules(goal, userQuestion);
    }
  }

  private planWithRules(goal: RecognizedGoal, _userQuestion: string): AITask[] {
    void _userQuestion;
    const taskDefs = goalTaskMap[goal.type] ?? goalTaskMap["general-question"];
    const now = Date.now();

    const tasks: AITask[] = taskDefs.map((def, i) => ({
      id: `task-${def.agent}-${i}`,
      goalType: goal.type,
      description: def.description,
      taskType: def.taskType,
      assignedAgent: def.agent,
      status: "pending",
    }));

    // 追加财富策略 Agent（综合）与综合总结 Agent（高层摘要），位于所有分析任务之后
    tasks.push({
      id: `task-strategy-${now}`,
      goalType: goal.type,
      description: "综合现金流、投资、风险、退休分析，生成年度财富行动计划",
      taskType: "summarization",
      assignedAgent: "strategy",
      status: "pending",
    });
    tasks.push({
      id: `task-summary-${now}`,
      goalType: goal.type,
      description: "将所有智能体结论综合为执行摘要与优先级建议",
      taskType: "summarization",
      assignedAgent: "summary",
      status: "pending",
    });

    return tasks;
  }

  private async planWithAI(opts: PlanOptions): Promise<AITask[]> {
    const { profile, activeEvents, goal, userQuestion } = opts;

    const systemPrompt = getPrompt("planner");

    const contextData = contextBuilder.buildFinancialData({
      profile,
      activeEvents,
      goal,
      recentQuestions: [userQuestion],
    });

    const messages = contextBuilder.buildMessages(
      systemPrompt,
      `Goal: ${goal.label} (${goal.type})\nQuestion: ${userQuestion}`,
      contextData
    );

    const response = await aiService.generate(
      messages as Parameters<typeof aiService.generate>[0],
      {
        taskType: "planning",
        temperature: 0.3,
        responseFormat: "json",
      }
    );

    const parsed = JSON.parse(response.content);
    const now = Date.now();

    const mapped: AITask[] = parsed
      .filter(
        (t: { agent?: string }) =>
          t.agent !== "strategy" && t.agent !== "summary"
      )
      .map((t: { agent: string; description: string; taskType?: TaskType }, i: number) => ({
        id: `task-${t.agent}-${i}`,
        goalType: goal.type,
        description: t.description,
        taskType: t.taskType ?? "analysis",
        assignedAgent: t.agent,
        status: "pending",
      }));

    // 始终在分析任务之后追加 strategy 与 summary（去重）
    mapped.push({
      id: `task-strategy-${now}`,
      goalType: goal.type,
      description: "综合生成年度财富行动计划",
      taskType: "summarization",
      assignedAgent: "strategy",
      status: "pending",
    });
    mapped.push({
      id: `task-summary-${now}`,
      goalType: goal.type,
      description: "综合生成执行摘要",
      taskType: "summarization",
      assignedAgent: "summary",
      status: "pending",
    });

    return mapped;
  }
}

export const planner = new Planner();
