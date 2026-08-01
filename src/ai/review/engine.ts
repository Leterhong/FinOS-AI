import "server-only";

import type { FinancialProfile } from "@/data/types";
import type { TwinSnapshot } from "@/twin/engine";
import { computeGoalProgress } from "@/ai/monitoring";
import { taskManager } from "@/wealth/tasks";
import type { GoalProgress } from "@/ai/monitoring";

export type ReviewType = "weekly" | "monthly" | "yearly";

/** 财富复盘报告（Phase 5 六）。 */
export interface ReviewReport {
  type: ReviewType;
  generatedAt: number;
  period: string;
  summary: string;
  /** 资产变化（估算：本期末 vs 上期末）。 */
  assetChange: { before: number; after: number; pct: number };
  goalProgress: GoalProgress[];
  riskChange: string;
  nextActions: string[];
  /** 本周期已完成任务数。 */
  tasksCompleted: number;
  /** 待办任务数。 */
  tasksPending: number;
}

const PERIOD_MONTHS: Record<ReviewType, number> = {
  weekly: 1 / 4.3,
  monthly: 1,
  yearly: 12,
};
const PERIOD_LABEL: Record<ReviewType, string> = {
  weekly: "本周",
  monthly: "本月",
  yearly: "本年",
};

/**
 * Review Engine（Phase 5 六）。
 *
 * 生成周 / 月 / 年 复盘报告：资产变化、目标完成度、风险变化、下一步行动，
 * 并结合 Task System 的执行情况（完成数）反映用户执行能力。
 */
export function generateReview(
  type: ReviewType,
  userId: string,
  profile: FinancialProfile,
  twin: TwinSnapshot
): ReviewReport {
  const months = PERIOD_MONTHS[type];
  const monthlyNet =
    (profile.monthlySalary || 0) - (profile.monthlyExpenses || 0);

  const after = twin.netWorth;
  const before = Math.max(0, after - monthlyNet * months);
  const pct = before > 0 ? ((after - before) / before) * 100 : 0;

  const goalProgress = computeGoalProgress(profile, twin);

  const riskDim = twin.health.dimensions.find((d) => d.key === "risk");
  const riskChange = riskDim
    ? `风险健康分 ${riskDim.score}（${riskDim.note}）。`
    : "风险数据暂不可用。";

  const completed = taskManager.filterByStatus(userId, "done");
  const pending = taskManager.filterByStatus(userId, "pending");

  const nextActions: string[] = [];
  if (!twin.onTrack) {
    nextActions.push(
      `退休轨迹存在缺口，建议每月增加定投 ¥${Math.round(
        (profile.monthlyInvestment || 0) * 0.25 + (profile.monthlySalary || 0) * 0.05
      ).toLocaleString("zh-CN")}。`
    );
  }
  if (pending.length > 0) {
    nextActions.push(`完成 ${pending.length} 项待办任务，保持计划执行力。`);
  }
  const emergencyMonths =
    profile.cashSavings > 0 && profile.monthlyExpenses > 0
      ? profile.cashSavings / profile.monthlyExpenses
      : 0;
  if (emergencyMonths < 6) {
    nextActions.push("补足应急储备金至 6 个月生活费。");
  }
  if (nextActions.length === 0) {
    nextActions.push("维持当前节奏，按计划推进长期投资。");
  }

  const summary = `【${PERIOD_LABEL[type]}复盘】净资产 ¥${after.toLocaleString(
    "zh-CN"
  )}，预计 ${twin.projectedRetireAge} 岁退休（${
    twin.onTrack ? "达标" : "延期"
  }）。本周期完成 ${completed.length} 项任务，待办 ${pending.length} 项。健康分 ${
    twin.health.total
  }（${twin.health.grade}）。`;

  return {
    type,
    generatedAt: Date.now(),
    period: PERIOD_LABEL[type],
    summary,
    assetChange: { before: Math.round(before), after: Math.round(after), pct: Math.round(pct * 10) / 10 },
    goalProgress,
    riskChange,
    nextActions,
    tasksCompleted: completed.length,
    tasksPending: pending.length,
  };
}
