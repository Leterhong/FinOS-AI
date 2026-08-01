import "server-only";

import type { FinancialProfile } from "@/data/types";
import { computeTwin } from "@/twin/engine";
import type { TwinSnapshot } from "@/twin/engine";
import { profileManager } from "@/financial-profile";
import { agentMemory } from "@/ai/memory";
import { workflowEngine } from "@/ai/services/WorkflowEngine";
import { detectFinancialEvents } from "./detector";
import { computeGoalProgress } from "./goals";
import { generateActionPlan } from "./action-plan";
import { generateNotifications } from "./notification";
import { generateBriefing } from "./advisor";
import { generateActionPlan as generateExecutionPlan, toWealthTasks } from "@/ai/agents/action-agent";
import { taskManager } from "@/wealth/tasks";
import type { WealthTask } from "@/wealth/tasks";
import type { MonitoringResult } from "./types";
import type { AgentAnalysisOutput } from "@/ai/types";

/** 主动监控输入。 */
export interface MonitorInput {
  /** 用户 id（用于画像读取 / 记忆隔离 / 持久化）。 */
  userId?: string;
  /** 待监控的画像；若缺省则从 userId 读取已存画像。 */
  profile?: FinancialProfile;
  /** 上一期画像（变化检测基准）。 */
  prevProfile?: FinancialProfile | null;
  /** 上一期 Twin 快照（变化检测基准）。 */
  prevSnapshot?: TwinSnapshot | null;
  /** 是否调用 Risk / Investment / Retirement 多智能体做深度分析。 */
  runAgents?: boolean;
  /** Phase 5：是否在监控后由 Action Agent 拆出执行任务并写入 Task System。 */
  createTasks?: boolean;
}

export interface MonitorOutput {
  monitoring: MonitoringResult;
  /** 多智能体分析结果（runAgents=true 且有 LLM 时才有实质内容）。 */
  agents?: AgentAnalysisOutput[];
  /** Phase 5：Action Agent 创建的执行任务（createTasks=true 时）。 */
  tasks?: WealthTask[];
}

function buildMonitorQuestion(alerts: ReturnType<typeof detectFinancialEvents>): string {
  if (alerts.length === 0) {
    return "主动体检未发现明显异常，请确认我的财富规划是否需要优化。";
  }
  const top = [...alerts]
    .sort((a, b) => sevRank(b.severity) - sevRank(a.severity))
    .slice(0, 3)
    .map((a) => a.title)
    .join("、");
  return `主动监控发现以下问题：${top}。请重新评估我的风险承受度、投资组合与退休规划，并给出调整建议。`;
}

function sevRank(s: string): number {
  return s === "critical" ? 2 : s === "warn" ? 1 : 0;
}

/**
 * 给任意 Promise 套一层超时保护：超时则不抛错，而是返回 undefined。
 * 多智能体深度分析依赖 LLM，任何环境下 LLM 慢/不可达都不应阻塞主动体检主链路。
 */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Wealth Monitoring Engine（Phase 4 一）+ 编排器。
 *
 * 流水线：
 *   computeTwin → 事件检测 → 目标进度 → 行动计划 → 提醒 → 简报
 *   → 记忆持久化 →（可选）WorkflowEngine 多智能体深度分析（Risk/Investment/Retirement）。
 *
 * 整个监控 / 提醒 / 建议层均为确定性逻辑，不依赖 LLM，可在沙箱完整运行；
 * 多智能体层在其 LLM 不可达时优雅降级为占位结果，不影响主链路。
 */
export async function runMonitoring(input: MonitorInput): Promise<MonitorOutput> {
  const userId = input.userId ?? "default-user";

  // 1) 解析画像：优先用传入，否则读存储
  let profile = input.profile;
  if (!profile) {
    const rec = userId !== "default-user" ? profileManager.getProfile(userId) : null;
    if (rec) profile = rec.profile;
  }
  if (!profile) {
    throw new Error("缺少待监控的画像（请提供 profile 或有效 userId）");
  }

  // 2) 计算 Twin（动态财富模型）
  const twin = computeTwin(profile);

  // 3) 事件检测
  const alerts = detectFinancialEvents(profile, twin, {
    prevProfile: input.prevProfile,
    prevSnapshot: input.prevSnapshot,
  });

  // 4) 目标进度
  const goalProgress = computeGoalProgress(profile, twin);

  // 5) 行动计划
  const actionPlan = generateActionPlan(profile, twin, alerts);

  // 6) 提醒
  const notifications = generateNotifications(profile, twin, alerts);

  // 7) 主动简报
  const briefing = generateBriefing(profile, twin, alerts, goalProgress, actionPlan);

  const monitoring: MonitoringResult = {
    monitoredAt: Date.now(),
    alerts,
    notifications,
    goalProgress,
    actionPlan,
    briefing,
    healthScore: twin.health.total,
    netWorth: twin.netWorth,
    onTrack: twin.onTrack,
  };

  // 8) 记忆持久化（Phase 3.5 隔离体系）
  try {
    const summary = `主动体检：${alerts.length} 项异常，健康分 ${twin.health.total}，净资产 ¥${twin.netWorth.toLocaleString()}。`;
    agentMemory.addFinancialMemory(userId, {
      changeNote: summary,
      totalAssets: twin.totalAssets,
      netWorth: twin.netWorth,
      monthlySalary: profile.monthlySalary,
      liabilities: profile.liabilities,
    });
    if (alerts.length > 0) {
      agentMemory.addDecisionMemory(userId, {
        question: "AI CFO 主动体检",
        recommendation: summary,
        agent: "advisor",
      });
    }
  } catch {
    /* 持久化失败不影响当次监控 */
  }

  // 9)（可选）多智能体深度分析：Monitor → Planner → Risk → Investment → Retirement → Advisor
  let agents: AgentAnalysisOutput[] | undefined;
  if (input.runAgents) {
    const question = buildMonitorQuestion(alerts);
    // 25s 超时保护：LLM 慢/不可达时本调用返回 undefined，主链路不受影响。
    const state = await withTimeout(
      workflowEngine.run({
        question,
        profile,
        activeEvents: [],
        userId,
      }),
      25000
    );
    agents = state?.results;
  }

  // 10)（可选）Action Agent → Task System：把监控发现转为可执行任务（Phase 5 十）
  let tasks: WealthTask[] | undefined;
  if (input.createTasks) {
    try {
      const plan = generateExecutionPlan({
        goal: "财富优化",
        twin,
        profile,
        preference: { riskLevel: profile.riskLevel },
      });
      const inputs = toWealthTasks(plan, { source: "monitor" }).map((t) => ({
        ...t,
        planHorizon: horizonOfDeadline(t.deadline),
      }));
      tasks = taskManager.createMany(userId, inputs);
      agentMemory.addExecutionMemory(userId, {
        kind: "plan-effect",
        note: `主动监控触发执行计划：${tasks.length} 项任务已写入 Task System。`,
      });
    } catch {
      /* 任务创建失败不影响监控主链路 */
    }
  }

  return { monitoring, agents, tasks };
}

function horizonOfDeadline(deadline?: string): "short" | "medium" | "long" | undefined {
  if (!deadline) return undefined;
  const days = (new Date(deadline).getTime() - Date.now()) / 86400000;
  if (days <= 35) return "short";
  if (days <= 400) return "medium";
  return "long";
}
