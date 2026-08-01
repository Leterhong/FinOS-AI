import "server-only";

import { getAgent } from "../../agents";
import { contextBuilder } from "../context/ContextBuilder";
import { goalRecognizer } from "./GoalRecognizer";
import { planner } from "./Planner";
import { agentMemory } from "../memory";
import { toolRouter } from "../tools/router";
import type { ToolCallRecord } from "../tools/types";
import { applyScenario } from "@/scenario/scenario-engine";
import { computeTwin } from "@/twin/engine";
import type { TwinSnapshot } from "@/twin/engine";
import { profileManager } from "@/financial-profile";
import { getFinancialSummary } from "@/financial-data/sync";
import { financeDb } from "@/financial-data/storage";
import { toRealDataContext } from "@/financial-data/real-context";
import { filterRealDataByConsent, hasConsent, logDataAccess } from "@/financial-data/consent";
import { toMarketDataContext } from "@/market/ai-context";
import { buildPortfolioReport } from "@/market/portfolio/service";
import type { FinancialProfile } from "@/data/types";
import type {
  WorkflowState,
  WorkflowPhase,
  AITask,
  AgentAnalysisOutput,
  RecognizedGoal,
} from "../types";

export interface WorkflowCallbacks {
  onPhaseChange?: (phase: WorkflowPhase) => void;
  onGoalRecognized?: (goal: RecognizedGoal) => void;
  onTasksPlanned?: (tasks: AITask[]) => void;
  onTaskStart?: (task: AITask) => void;
  onTaskComplete?: (task: AITask, result: AgentAnalysisOutput) => void;
  onSummaryComplete?: (summary: AgentAnalysisOutput) => void;
  /** 工具调用记录（Phase 3.4 Tool Calling）：单个 Agent 的工具调用完成后推送。 */
  onToolCalls?: (records: ToolCallRecord[]) => void;
  /** Phase 3.5：Twin 财富路径重算后推送（人生事件模拟）。 */
  onTwinUpdate?: (snapshot: TwinSnapshot) => void;
  onError?: (error: Error) => void;
}

export interface WorkflowInput {
  question: string;
  profile: FinancialProfile;
  activeEvents: string[];
  /** Phase 3.5：用户 id，用于记忆隔离与画像持久化。 */
  userId?: string;
  /** Phase 3.5：人生事件 id（如 startBusiness），触发 Twin 重算财富路径。 */
  lifeEventId?: string;
  /** Phase 6.5：按需 Agent 选择；提供时仅运行这些分析型 Agent（strategy/summary 始终运行）。 */
  selectedAgents?: string[];
  /** Phase 6.6：用户长期记忆上下文（Memory Retriever 生成，注入每个 Agent）。 */
  memoryContext?: string;
}

class WorkflowEngine {
  /**
   * Execute the full AI workflow:
   * Goal Recognition → Planning → Agent Execution → Summary
   *
   * Every AI call goes through AIService → ModelRouter → Provider.
   * No agent, page, or component calls an LLM directly.
   */
  async run(
    input: WorkflowInput,
    callbacks: WorkflowCallbacks = {}
  ): Promise<WorkflowState> {
    const startTime = Date.now();
    const workflowId = `wf-${startTime}`;
    const userId = input.userId ?? "default-user";

    // ── Phase 3.5：人生事件模拟 → Twin 重算财富路径 ──
    let effectiveProfile = input.profile;
    if (input.lifeEventId) {
      effectiveProfile = applyScenario(input.profile, input.lifeEventId);
      const twinSnapshot = computeTwin(effectiveProfile, { events: [input.lifeEventId] });
      try {
        agentMemory.addFinancialMemory(userId, {
          changeNote: `人生事件[${input.lifeEventId}]：重新计算财富路径`,
          totalAssets: twinSnapshot.totalAssets,
          netWorth: twinSnapshot.netWorth,
          monthlySalary: effectiveProfile.monthlySalary,
          liabilities: effectiveProfile.liabilities,
        });
        profileManager.updateProfile(userId, effectiveProfile);
      } catch {
        /* 持久化失败不影响主流程 */
      }
      callbacks.onTwinUpdate?.(twinSnapshot);
    }

    const state: WorkflowState = {
      id: workflowId,
      phase: "idle",
      tasks: [],
      results: [],
      startedAt: startTime,
    };

    try {
      // ── Phase 1: Goal Recognition ────────────────────────────────────
      this.setPhase(state, "recognizing-goal", callbacks);

      const goal = await goalRecognizer.recognize(input.question);
      state.goal = goal;
      callbacks.onGoalRecognized?.(goal);

      // ── Phase 2: Planning ────────────────────────────────────────────
      this.setPhase(state, "planning", callbacks);

      const tasks = await planner.plan({
        profile: effectiveProfile,
        activeEvents: input.activeEvents,
        goal,
        userQuestion: input.question,
      });
      state.tasks = tasks;
      callbacks.onTasksPlanned?.(tasks);

      // ── Phase 3: 并行执行分析型智能体 ─────────────────────────────
      this.setPhase(state, "executing", callbacks);

      const results: AgentAnalysisOutput[] = [];
      // Phase 6：注入真实金融数据摘要（存在时 Agent 优先基于真实流水 / 持仓分析）
      let realData: ReturnType<typeof toRealDataContext> | undefined;
      try {
        const dataSummary = getFinancialSummary(userId);
        const rawRealData = toRealDataContext(dataSummary, financeDb.getHoldings(userId));
        // Phase 6.3 #220：数据权限层 —— 按用户授权做字段级裁剪 + 落审计日志
        const filtered = filterRealDataByConsent(userId, rawRealData);
        realData = filtered.realData;
        if (rawRealData) {
          logDataAccess(userId, {
            accessor: "workflow-engine",
            purpose: `AI CFO 多智能体分析：${input.question.slice(0, 80)}`,
            scopes: filtered.grantedScopes,
            deniedScopes: filtered.deniedScopes,
          });
        }
      } catch {
        realData = undefined;
      }
      state.usedRealData = Boolean(realData);

      // Phase 6.4：注入市场智能数据（受 market 授权作用域守卫 + 审计）。
      // 组合指标由确定性纯函数计算，行情缺失时 toMarketDataContext 返回 undefined（优雅降级）。
      let marketData: ReturnType<typeof toMarketDataContext>;
      try {
        if (hasConsent(userId, "market")) {
          const report = await buildPortfolioReport(financeDb.getHoldings(userId));
          marketData = toMarketDataContext(report);
          if (marketData) {
            logDataAccess(userId, {
              accessor: "workflow-engine",
              purpose: `AI CFO 市场数据关联分析：${input.question.slice(0, 80)}`,
              scopes: ["market"],
              deniedScopes: [],
            });
          }
        } else {
          logDataAccess(userId, {
            accessor: "workflow-engine",
            purpose: `AI CFO 市场数据关联分析：${input.question.slice(0, 80)}`,
            scopes: [],
            deniedScopes: ["market"],
          });
        }
      } catch {
        marketData = undefined;
      }

      const contextData = contextBuilder.buildFinancialData({
        profile: effectiveProfile,
        activeEvents: input.activeEvents,
        goal,
        recentQuestions: [input.question],
        history: agentMemory.getHistory(userId),
        realData,
        marketData,
      });

      // 分析型任务（cashflow/investment/risk/retirement）并行；
      // strategy / summary 留到综合阶段顺序执行。
      const synthesisAgents = new Set(["strategy", "summary"]);
      let analysisTasks = tasks.filter((t) => !synthesisAgents.has(t.assignedAgent));
      const synthesisTasks = tasks.filter((t) => synthesisAgents.has(t.assignedAgent));

      // Phase 6.5：按需 Agent 选择（路由层已决定只跑需要的 Agent）
      if (input.selectedAgents && input.selectedAgents.length > 0) {
        const selected = new Set(input.selectedAgents);
        analysisTasks = analysisTasks.filter((t) => selected.has(t.assignedAgent));
      }

      // 先统一推送 task-start，让前端所有分析智能体同时进入"运行中"（并行可视化）
      for (const task of analysisTasks) {
        task.status = "running";
        task.startedAt = Date.now();
        callbacks.onTaskStart?.(task);
      }

      const analysisOutcomes = await Promise.all(
        analysisTasks.map((task) =>
          this.runTaskSafe(task, contextData, results, input.question, callbacks, userId, input.memoryContext)
        )
      );
      for (const outcome of analysisOutcomes) {
        results.push(outcome.result);
        state.results = [...results];
        callbacks.onTaskComplete?.(outcome.task, outcome.result);
      }

      // ── Phase 4: 综合（Strategy → Summary）────────────────────────
      this.setPhase(state, "summarizing", callbacks);

      for (const task of synthesisTasks) {
        task.status = "running";
        task.startedAt = Date.now();
        callbacks.onTaskStart?.(task);
        const outcome = await this.runTaskSafe(task, contextData, results, input.question, callbacks, userId, input.memoryContext);
        results.push(outcome.result);
        state.results = [...results];
        callbacks.onTaskComplete?.(outcome.task, outcome.result);
        if (task.assignedAgent === "summary") {
          state.summary = outcome.result;
          callbacks.onSummaryComplete?.(outcome.result);
        }
      }

      // ── 记忆持久化（Phase 3.5：按 userId 隔离）────────────────────
      try {
        agentMemory.saveMemory(
          {
            question: input.question,
            goals: goal ? [goal.label] : [],
            results: state.results,
            summary: state.summary,
            strategy: state.results.find((r) => r.agentId === "strategy"),
          },
          userId
        );
      } catch {
        // 记忆持久化失败不影响主流程
      }

      // ── Complete ─────────────────────────────────────────────────────
      this.setPhase(state, "complete", callbacks);
      state.completedAt = Date.now();

    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      state.phase = "failed";
      state.error = error.message;
      state.completedAt = Date.now();
      callbacks.onError?.(error);
    }

    return state;
  }

  private setPhase(
    state: WorkflowState,
    phase: WorkflowPhase,
    callbacks: WorkflowCallbacks
  ) {
    state.phase = phase;
    callbacks.onPhaseChange?.(phase);
  }

  /**
   * Execute a single agent task via AIService.
   */
  private async executeAgentTask(
    task: AITask,
    contextData: ReturnType<typeof contextBuilder.buildFinancialData>,
    previousResults: AgentAnalysisOutput[],
    userQuestion: string | undefined,
    callbacks: WorkflowCallbacks,
    userId?: string,
    memoryContext?: string
  ): Promise<AgentAnalysisOutput> {
    const agent = getAgent(task.assignedAgent);

    // ── Phase 3.4 Tool Calling：经 ToolRouter 自动调用金融工具，注入真实数据 ──
    let toolContext: import("../tools/types").ToolContext | null = null;
    try {
      const ctx = await toolRouter.executeForAgent(agent.id, contextData, userQuestion);
      if (ctx.records.length > 0) {
        toolContext = ctx;
        callbacks.onToolCalls?.(ctx.records);
      }
    } catch {
      // 工具调用失败不应阻塞 LLM 分析，仅记录为空
      toolContext = null;
    }

    return agent.analyze(contextData, {
      previousResults,
      taskDescription: task.description,
      // Phase 3.3：用户原始问题用于 RAG 检索查询构造
      userQuestion,
      // Phase 3.4：实时金融工具数据
      toolContext,
      // Phase 6.6：私人知识库检索隔离 + 用户长期记忆注入
      userId,
      memoryContext,
    });
  }

  /**
   * 执行单个任务并吞掉异常：单智能体失败不应拖垮整条工作流。
   * 失败时返回一个明确的错误占位结果，前端据此展示"分析未完成"而非白屏。
   */
  private async runTaskSafe(
    task: AITask,
    contextData: ReturnType<typeof contextBuilder.buildFinancialData>,
    previousResults: AgentAnalysisOutput[],
    userQuestion: string | undefined,
    callbacks: WorkflowCallbacks,
    userId?: string,
    memoryContext?: string
  ): Promise<{ task: AITask; result: AgentAnalysisOutput }> {
    try {
      const result = await this.executeAgentTask(task, contextData, previousResults, userQuestion, callbacks, userId, memoryContext);
      task.status = "done";
      task.completedAt = Date.now();
      task.result = result;
      return { task, result };
    } catch (err) {
      const message = err instanceof Error ? err.message : "分析失败";
      task.status = "failed";
      task.completedAt = Date.now();
      task.error = message;
      const placeholder: AgentAnalysisOutput = {
        agentId: task.assignedAgent,
        headline: "分析未完成",
        bullets: [message],
        metrics: [],
        confidence: 0,
        rawContent: message,
      };
      task.result = placeholder;
      return { task, result: placeholder };
    }
  }
}

export const workflowEngine = new WorkflowEngine();
