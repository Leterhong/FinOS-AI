import "server-only";

import type { FinancialProfile } from "@/data/types";
import type { TwinSnapshot } from "@/twin/engine";
import type {
  ActionPlan,
  AdvisorBriefing,
  FinancialAlert,
  GoalProgress,
} from "./types";

/**
 * AI Advisor Agent（Phase 4 三）。
 * 读取 Financial Twin + Memory + 异常事件 + 目标进度，生成面向用户的主动简报。
 * 这是用户打开系统时看到的那条"早安"消息的来源。
 */
export function generateBriefing(
  profile: FinancialProfile,
  twin: TwinSnapshot,
  alerts: FinancialAlert[],
  goalProgress: GoalProgress[],
  actionPlan: ActionPlan
): AdvisorBriefing {
  const now = Date.now();

  // 问候语：依据一天时段 / 异常数量生成
  const hour = new Date().getHours();
  const period = hour < 6 ? "凌晨好" : hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";
  const greeting = `${period}，${profile.name}。`;

  // 变化描述：优先展示 critical / warn
  const ordered = [...alerts].sort((a, b) => sevRank(b.severity) - sevRank(a.severity));
  const changes = ordered.map((a) => `【${a.title}】${a.message}`);

  // 优先行动：合并周 / 月行动的前几条
  const topActions = [
    ...actionPlan.weekly.slice(0, 2),
    ...actionPlan.monthly.slice(0, 2),
  ].map((a) => `${a.title}：${a.detail}`);

  // 总结句
  const onTrackText = twin.onTrack
    ? `当前模型显示您有望在 ${twin.projectedRetireAge} 岁达成退休目标，健康分 ${twin.health.total}（${twin.health.grade}）。`
    : `按当前轨迹您将在 ${twin.projectedRetireAge} 岁退休，比目标晚 ${Math.abs(
        twin.retireGapYears
      )} 年，建议尽快修复现金流与配置。`;

  const summary =
    alerts.length > 0
      ? `我注意到您的财富状态出现 ${alerts.length} 个变化，已为您生成应对建议；${onTrackText}`
      : `您的财富状态一切平稳；${onTrackText}`;

  return {
    greeting,
    changeCount: alerts.length,
    changes,
    topActions,
    summary,
    generatedAt: now,
  };
}

function sevRank(s: FinancialAlert["severity"]): number {
  return s === "critical" ? 2 : s === "warn" ? 1 : 0;
}
