import "server-only";

import type { FinancialProfile } from "@/data/types";
import type { TwinSnapshot } from "@/twin/engine";
import type { GoalProgress, GoalStatus } from "./types";

/**
 * Goal Tracking（Phase 4 七）。
 * 持续跟踪退休 / 买房 / 创业 / 教育等目标，计算完成百分比与状态。
 *
 * 进度口径：
 *  - 退休：以 Twin 终值资产 vs 退休目标金额（反映复利后可达成的退休储备）。
 *  - 买房 / 教育：以可动用流动性（现金 + 基金）vs 目标金额（首付 / 教育金）。
 *  - 创业：以可部署资本（现金）vs 创业所需启动资金。
 *  - 财富增长：以当前总资产 vs 目标金额。
 */
export function computeGoalProgress(
  profile: FinancialProfile,
  twin: TwinSnapshot
): GoalProgress[] {
  const currentYear = new Date().getFullYear();
  const liquid = profile.cashSavings + profile.funds;
  const goals = profile.goals ?? [];

  const items: GoalProgress[] = goals.map((g) => {
    let currentAmount = 0;
    let target = g.targetAmount ?? profile.goal.targetAmount;
    let note = "";

    switch (g.type) {
      case "retirement": {
        currentAmount = twin.projection.length
          ? twin.projection[twin.projection.length - 1].assets
          : profile.totalAssets;
        target = profile.goal.targetAmount;
        note = twin.onTrack
          ? `预计 ${twin.projectedRetireAge} 岁可达成，比目标提前 ${Math.abs(
              twin.retireGapYears
            )} 年。`
          : `预计 ${twin.projectedRetireAge} 岁退休，比目标晚 ${Math.abs(
              twin.retireGapYears
            )} 年，需增厚储备。`;
        break;
      }
      case "buy-house": {
        currentAmount = liquid;
        target = g.targetAmount ?? 2_000_000;
        note = `已积累首付能力 ¥${currentAmount.toLocaleString()}，目标 ¥${target.toLocaleString()}。`;
        break;
      }
      case "start-business": {
        currentAmount = profile.cashSavings;
        target = g.targetAmount ?? 1_000_000;
        note = `可部署创业资本 ¥${currentAmount.toLocaleString()}，目标 ¥${target.toLocaleString()}。`;
        break;
      }
      case "education": {
        currentAmount = liquid;
        target = g.targetAmount ?? 1_000_000;
        note = `教育金储备 ¥${currentAmount.toLocaleString()}，目标 ¥${target.toLocaleString()}。`;
        break;
      }
      case "wealth-growth": {
        currentAmount = profile.totalAssets;
        target = g.targetAmount ?? profile.totalAssets * 2;
        note = `当前总资产 ¥${currentAmount.toLocaleString()}。`;
        break;
      }
      default: {
        currentAmount = profile.totalAssets;
        target = g.targetAmount ?? profile.totalAssets;
        note = g.label ? `目标：${g.label}。` : "持续跟踪中。";
      }
    }

    const progressPct = target > 0 ? Math.min(100, Math.round((currentAmount / target) * 100)) : 0;

    // 状态判定：退休属于未来目标，"预测终值达标"不等于"已达成"，
    // 只有真正到达退休年龄且净资产达标才标 achieved，否则用 onTrack/delayed。
    let status: GoalStatus = "on-track";
    if (g.type === "retirement") {
      if (profile.age >= profile.goal.retirementAge && twin.netWorth >= target) {
        status = "achieved";
      } else if (!twin.onTrack) {
        status = "delayed";
      } else {
        status = "on-track";
      }
    } else if (g.status === "achieved" || progressPct >= 100) {
      status = "achieved";
    } else if (progressPct < 30) {
      status = "at-risk";
    }

    return {
      id: g.id,
      type: g.type,
      label: g.label,
      targetAmount: target,
      currentAmount,
      progressPct,
      targetYear: g.targetYear ?? (g.type === "retirement" ? profile.goal.retirementAge + currentYear - profile.age : undefined),
      status,
      note,
    };
  });

  return items;
}
