import "server-only";

/**
 * Phase 6.8 Proactive Monitor —— AI CFO 主动体检主编排（需求一 / 二 / 三 / 十二 / 十三）。
 *
 * 流水线（一次检测、全链复用）：
 *   computeTwin
 *   → detectProactiveEvents（底层 9 类 + 连续支出上升 + 投资集中，纯代码）
 *   → 目标进度 / 行动计划 / 简报（monitoring 确定性原语）
 *   → 分级 Advisor（无事件不调 LLM；warn=轻量、critical=深度；预算+模型前置校验）
 *   → 事件 → 结构化通知 → Notification Policy 过滤 → 持久化
 *   → 运行日志（历史快照，供趋势检测与调度水位）。
 *
 * 变化检测基准：优先用调用方显式传入的 prevProfile/prevSnapshot；
 * 否则用上次运行日志快照重建"上一期"收入/支出基准（跨运行自动对比）。
 */

import type { FinancialProfile } from "@/data/types";
import { computeTwin } from "@/twin/engine";
import type { TwinSnapshot } from "@/twin/engine";
import { profileManager } from "@/financial-profile";
import { agentMemory } from "@/ai/memory";
import { computeGoalProgress } from "@/ai/monitoring/goals";
import { generateActionPlan } from "@/ai/monitoring/action-plan";
import { generateNotifications } from "@/ai/monitoring/notification";
import { generateBriefing } from "@/ai/monitoring/advisor";
import type { MonitoringResult } from "@/ai/monitoring/types";
import { detectProactiveEvents } from "./event-detector";
import { generateProactiveAdvice } from "./advisor";
import {
  applyNotificationPolicy,
  buildNotificationsFromEvents,
  proactiveStore,
} from "./notification";
import type { ProactiveResult, ProactiveRunLog } from "./types";

export interface ProactiveMonitorInput {
  userId: string;
  /** 待监控画像；缺省从 userId 读取已存画像。 */
  profile?: FinancialProfile;
  /** 显式变化基准（可选；缺省用运行日志快照重建）。 */
  prevProfile?: FinancialProfile | null;
  prevSnapshot?: TwinSnapshot | null;
  /** 运行类型（写入调度水位）。 */
  kind?: ProactiveRunLog["kind"];
}

/**
 * 执行一次 AI CFO 主动体检。
 */
export async function runProactiveMonitor(
  input: ProactiveMonitorInput
): Promise<ProactiveResult> {
  const { userId } = input;
  const kind = input.kind ?? "manual";

  // 1) 画像
  let profile = input.profile;
  if (!profile) {
    const rec = profileManager.getProfile(userId);
    if (rec) profile = rec.profile;
  }
  if (!profile) {
    throw new Error("缺少待监控的画像（请提供 profile 或有效 userId）");
  }

  // 2) Twin
  const twin = computeTwin(profile);

  // 3) 历史基准：显式传入优先，否则用上次运行日志快照重建
  const logs = proactiveStore.listRunLogs(userId);
  const lastLog = logs.length > 0 ? logs[logs.length - 1] : null;
  let prevProfile = input.prevProfile ?? null;
  if (!prevProfile && lastLog) {
    prevProfile = {
      ...profile,
      monthlySalary: lastLog.monthlySalary,
      monthlyExpenses: lastLog.monthlyExpenses,
      totalAssets: lastLog.totalAssets,
    };
  }
  const expenseHistory = logs.map((l) => l.monthlyExpenses);

  // 4) 事件检测（纯代码，不调 LLM）
  const events = detectProactiveEvents(profile, twin, {
    prevProfile,
    prevSnapshot: input.prevSnapshot ?? null,
    expenseHistory,
  });

  // 5) 确定性分析原语（目标进度 / 行动计划 / 提醒 / 简报）
  const goalProgress = computeGoalProgress(profile, twin);
  const actionPlan = generateActionPlan(profile, twin, events);
  const baseNotifications = generateNotifications(profile, twin, events);
  const briefing = generateBriefing(
    profile,
    twin,
    events,
    goalProgress,
    actionPlan
  );

  const monitoring: MonitoringResult = {
    monitoredAt: Date.now(),
    alerts: events,
    notifications: baseNotifications,
    goalProgress,
    actionPlan,
    briefing,
    healthScore: twin.health.total,
    netWorth: twin.netWorth,
    onTrack: twin.onTrack,
  };

  // 6) 分级 AI 建议（用户关闭主动提醒时完全跳过，节省成本 = 验收测试 4）
  const settings = proactiveStore.getSettings(userId);
  let advice: ProactiveResult["advice"] = null;
  let aiCalls = 0;
  let budgetBlocked = false;
  if (settings.enabled) {
    const outcome = await generateProactiveAdvice(userId, profile, twin, events);
    advice = outcome.advice;
    aiCalls = outcome.aiCalls;
    budgetBlocked = outcome.budgetBlocked;
  }

  // 7) 事件 → 结构化通知 → Policy 过滤 → 持久化（绑定 user_id）
  const candidates = buildNotificationsFromEvents(
    userId,
    profile,
    twin,
    events,
    kind === "weekly" ? "weekly-report" : kind === "daily" ? "daily-brief" : "monitor"
  );
  const { accepted, suppressed } = applyNotificationPolicy(
    userId,
    settings,
    candidates
  );
  const stored = proactiveStore.addNotifications(userId, accepted);

  // 8) 运行日志（历史快照 + 调度水位 + 成本审计）
  const runLog: ProactiveRunLog = {
    runAt: Date.now(),
    kind,
    eventCount: events.length,
    criticalCount: events.filter((e) => e.severity === "critical").length,
    aiCalls,
    healthScore: twin.health.total,
    netWorth: twin.netWorth,
    totalAssets: twin.totalAssets,
    monthlySalary: profile.monthlySalary,
    monthlyExpenses: profile.monthlyExpenses,
    notificationCount: stored.length,
    suppressedCount: suppressed,
  };
  try {
    proactiveStore.addRunLog(userId, runLog);
  } catch {
    /* 日志失败不影响主链路 */
  }

  // 9) 长期记忆沉淀（Phase 3.5 隔离体系；失败不影响主链路）
  try {
    if (events.length > 0) {
      agentMemory.addDecisionMemory(userId, {
        question: "AI CFO 主动监控",
        recommendation: `发现 ${events.length} 项事件（${events
          .slice(0, 3)
          .map((e) => e.title)
          .join("、")}），健康分 ${twin.health.total}。`,
        agent: "advisor",
      });
    }
  } catch {
    /* 忽略 */
  }

  return {
    ranAt: runLog.runAt,
    monitoring,
    events,
    notifications: stored,
    suppressed,
    advice,
    aiCalls,
    budgetBlocked,
  };
}
