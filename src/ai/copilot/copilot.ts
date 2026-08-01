import "server-only";

import type { FinancialProfile } from "@/data/types";
import type { AgentAnalysisOutput } from "@/ai/types";
import { computeTwin } from "@/twin/engine";
import type { TwinSnapshot } from "@/twin/engine";
import { profileManager } from "@/financial-profile";
import { agentMemory } from "@/ai/memory";
import { workflowEngine } from "@/ai/services/WorkflowEngine";
import { runMonitoring } from "@/ai/monitoring";
import { generateActionPlan, toWealthTasks } from "@/ai/agents/action-agent";
import { generateWealthPlan } from "@/ai/plan/generator";
import { taskManager } from "@/wealth/tasks";
import type { WealthTask, PlanHorizon } from "@/wealth/tasks";
import type { ActionPlanJSON } from "@/ai/agents/action-agent";
import type { WealthPlan } from "@/ai/plan/generator";
import type { MonitoringResult, AdvisorBriefing } from "@/ai/monitoring";

export interface CopilotInput {
  /** 用户 id（记忆隔离 / 画像读取 / 任务持久化）。 */
  userId?: string;
  /** 待规划的画像；缺省时按 userId 读取。 */
  profile?: FinancialProfile;
  /** 用户自然语言（如"帮我制定退休计划" / "我最近花钱太多"）。 */
  message?: string;
  /** 目标类型（retirement / house-planning / 等）。 */
  goalType?: string;
  /** 目标名称（如 "50 岁退休"）。 */
  goalLabel?: string;
  /** 是否调用 Retirement / Investment 等智能体做深度策略（带超时保护）。 */
  runAgents?: boolean;
  /** 是否把计划拆为任务写入 Task System。 */
  createTasks?: boolean;
}

export interface CopilotResult {
  briefing: AdvisorBriefing;
  monitoring: MonitoringResult;
  /** Action Agent 拆解的执行计划（Action Plan JSON）。 */
  actionPlan: ActionPlanJSON;
  /** 三档财富计划（短期 / 中期 / 长期）。 */
  plan: WealthPlan;
  /** 已写入 Task System 的任务（createTasks=true 时）。 */
  tasks: WealthTask[];
  /** 策略（来自 LLM 多智能体或模型推导）。 */
  strategy?: AgentAnalysisOutput;
  /** 执行能力统计（来自 Execution Memory）。 */
  executionStats: ReturnType<typeof agentMemory.getExecutionStats>;
}

/** 超时保护：LLM 慢/不可达时返回 undefined，主链路不受影响。 */
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

/** 从自然语言推断目标类型与名称。 */
function inferGoal(message: string): { goalType: string; goalLabel: string } {
  const m = message.toLowerCase();
  if (m.includes("退休")) return { goalType: "retirement", goalLabel: "50 岁退休" };
  if (m.includes("买房") || m.includes("置业")) return { goalType: "house-planning", goalLabel: "买房" };
  if (m.includes("创业")) return { goalType: "income-optimization", goalLabel: "创业" };
  if (m.includes("教育") || m.includes("留学") || m.includes("孩子")) return { goalType: "education", goalLabel: "教育金" };
  return { goalType: "general-question", goalLabel: "财富优化" };
}

/** 由 Twin 推导确定性策略（无 LLM 时作为 Strategy Agent 输出）。 */
function deriveStrategy(twin: TwinSnapshot, goal: string): AgentAnalysisOutput {
  const dims = twin.health.dimensions.map((d) => `${d.label} ${d.score}`).join(" · ");
  return {
    agentId: "strategy",
    headline: `已为「${goal}」生成财富策略`,
    bullets: [
      twin.insight,
      `五维健康：${dims}`,
      twin.onTrack
        ? "当前轨迹已达标，维持节奏并优化结构即可。"
        : "当前轨迹存在缺口，需提升储蓄率与长期投资比例。",
    ],
    metrics: [
      { label: "预计退休年龄", value: `${twin.projectedRetireAge} 岁`, tone: twin.onTrack ? "good" : "risk" },
      { label: "综合健康分", value: `${twin.health.total}`, tone: twin.health.total >= 70 ? "good" : "warn" },
      { label: "退休达标", value: twin.onTrack ? "是" : "否", tone: twin.onTrack ? "good" : "risk" },
    ],
    confidence: 0.82,
  };
}

function horizonOfDeadline(deadline?: string): PlanHorizon | undefined {
  if (!deadline) return undefined;
  const days = (new Date(deadline).getTime() - Date.now()) / 86400000;
  if (days <= 35) return "short";
  if (days <= 400) return "medium";
  return "long";
}

/**
 * Wealth Copilot（Phase 5 四）。
 *
 * 编排完整主动执行流：
 *   Monitor → Detector → Planner → Strategy Agent → Action Agent → Task System → Memory → Notification
 *
 *  - 监控层（确定性）始终运行；
 *  - 策略层可选用 Retirement / Investment 多智能体（25s 超时保护，沙箱下优雅降级）；
 *  - Action Agent 把策略拆为可执行任务；
 *  - createTasks=true 时写入 Task System 并同步 Execution Memory；
 *  - 全程记忆按 userId 隔离。
 */
export async function runCopilot(input: CopilotInput): Promise<CopilotResult> {
  const userId = input.userId ?? "default-user";

  // 1) 解析画像
  let profile = input.profile;
  if (!profile) {
    const rec = userId !== "default-user" ? profileManager.getProfile(userId) : null;
    if (rec) profile = rec.profile;
  }
  if (!profile) {
    throw new Error("缺少待规划的画像（请提供 profile 或有效 userId）");
  }

  // 2) 动态 Twin
  const twin = computeTwin(profile);

  // 3) 监控 + 检测 + 简报（确定性主链路）
  const { monitoring } = await runMonitoring({
    userId,
    profile,
    runAgents: false,
  });

  // 4) 目标解析
  const inferred = input.message ? inferGoal(input.message) : null;
  const goalType = input.goalType ?? inferred?.goalType ?? "retirement";
  const goalLabel = input.goalLabel ?? inferred?.goalLabel ?? "50 岁退休";

  // 5) 策略：多智能体（带超时）或模型推导
  let strategy: AgentAnalysisOutput | undefined;
  if (input.runAgents) {
    const state = await withTimeout(
      workflowEngine.run({
        question: `帮我制定${goalLabel}计划`,
        profile,
        activeEvents: [],
        userId,
      }),
      25000
    );
    strategy =
      state?.results.find((r) => r.agentId === "strategy") ??
      state?.results.find((r) => r.agentId === "retirement");
  }
  if (!strategy) strategy = deriveStrategy(twin, goalLabel);

  // 6) Action Agent：策略 → 执行任务（Action Plan JSON）
  const actionPlan: ActionPlanJSON = generateActionPlan({
    goal: goalLabel,
    goalType,
    strategy,
    twin,
    profile,
    preference: { riskLevel: profile.riskLevel },
  });

  // 7) 三档财富计划
  const plan: WealthPlan = generateWealthPlan({
    twin,
    profile,
    goal: goalLabel,
    goalType,
  });

  // 8) 写入 Task System（30 天执行计划）
  let tasks: WealthTask[] = [];
  if (input.createTasks) {
    const inputs = toWealthTasks(actionPlan, { source: "copilot" }).map((t) => ({
      ...t,
      planHorizon: horizonOfDeadline(t.deadline),
    }));
    tasks = taskManager.createMany(userId, inputs);
  }

  // 9) 执行记忆：记录计划生成 / 目标
  try {
    agentMemory.addGoalMemory(userId, {
      goalType,
      label: goalLabel,
      targetYear: goalType === "retirement" ? profile.goal.retirementAge + new Date().getFullYear() - profile.age : undefined,
      targetAmount: profile.goal.targetAmount,
      status: twin.onTrack ? "on-track" : "delayed",
      note: `Copilot 生成财富计划（${actionPlan.tasks.length} 项执行任务），预计 ${twin.projectedRetireAge} 岁退休。`,
    });
    agentMemory.addExecutionMemory(userId, {
      kind: "plan-effect",
      note: `生成「${goalLabel}」计划：健康分 ${twin.health.total}，退休${twin.onTrack ? "达标" : "延期"}。`,
      goalType,
    });
  } catch {
    /* 持久化失败不影响主流程 */
  }

  return {
    briefing: monitoring.briefing,
    monitoring,
    actionPlan,
    plan,
    tasks,
    strategy,
    executionStats: agentMemory.getExecutionStats(userId),
  };
}
