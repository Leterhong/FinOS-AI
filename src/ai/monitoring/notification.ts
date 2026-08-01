import "server-only";

import type { FinancialProfile } from "@/data/types";
import { computeCashFlow } from "@/scenario/scenario-engine";
import type { TwinSnapshot } from "@/twin/engine";
import type {
  FinancialAlert,
  NotificationCategory,
  NotificationPriority,
  WealthNotification,
} from "./types";

function prioOf(severity: FinancialAlert["severity"]): NotificationPriority {
  return severity === "critical" ? "high" : severity === "warn" ? "medium" : "low";
}

function catOf(type: FinancialAlert["type"]): NotificationCategory {
  switch (type) {
    case "risk-increase":
    case "insurance-gap":
    case "allocation-deviation":
    case "investment-concentration": // Phase 6.8：投资集中 → 风险提醒
      return "risk";
    case "expense-consecutive": // Phase 6.8：支出趋势 → 财富提醒
      return "wealth";
    case "goal-delay":
      return "goal";
    case "income-drop":
    case "expense-increase":
    case "savings-rate-drop":
    case "asset-drop":
    case "emergency-fund-low":
    default:
      return "wealth";
  }
}

/**
 * Notification Engine（Phase 4 四）。
 * 将检测到的异常事件转化为面向用户的主动提醒，并补充"机会提醒"。
 *
 * 提醒类别：财富 / 风险 / 目标 / 机会。
 * 例如："你的现金储备已经低于 6 个月生活费。""你的投资组合风险高于你的承受能力。"
 */
export function generateNotifications(
  profile: FinancialProfile,
  twin: TwinSnapshot,
  alerts: FinancialAlert[]
): WealthNotification[] {
  const now = Date.now();
  const notes: WealthNotification[] = [];

  for (const a of alerts) {
    notes.push({
      id: `ntf-${a.id}`,
      category: catOf(a.type),
      priority: prioOf(a.severity),
      title: a.title,
      message: a.message,
      createdAt: now,
      relatedAlertId: a.id,
    });
  }

  // ── 机会提醒（仅在整体健康且无严重异常时出现） ──
  const hasCritical = alerts.some((a) => a.severity === "critical");
  const cf = computeCashFlow(profile);
  const totalAssets =
    profile.cashSavings +
    profile.stockPortfolio +
    profile.realEstate +
    profile.bonds +
    profile.crypto +
    profile.funds +
    profile.house +
    profile.insurance;
  const cashRatio = totalAssets > 0 ? profile.cashSavings / totalAssets : 0;

  if (!hasCritical && twin.health.total >= 75 && twin.onTrack) {
    notes.push({
      id: "ntf-opp-stable",
      category: "opportunity",
      priority: "low",
      title: "财富状态稳健",
      message: `您的财富健康分 ${twin.health.total}（${twin.health.grade}），退休目标按计划推进。可适度提升风险资产以加速复利。`,
      createdAt: now,
    });
  }

  if (cashRatio > 0.4 && profile.riskLevel !== "conservative" && !hasCritical) {
    notes.push({
      id: "ntf-opp-cash",
      category: "opportunity",
      priority: "low",
      title: "可部署闲置现金",
      message: `现金占资产 ${(cashRatio * 100).toFixed(
        0
      )}%，保留应急金后可将余量分批投入权益 / 基金，提升长期收益。`,
      createdAt: now,
    });
  }

  if (cf.savingsRate >= 30 && twin.onTrack && !hasCritical) {
    notes.push({
      id: "ntf-opp-save",
      category: "opportunity",
      priority: "low",
      title: "高储蓄率可加速目标",
      message: `当前储蓄率 ${cf.savingsRate.toFixed(
        1
      )}% 较高，可考虑提前达成退休目标或增加教育 / 创业专项储备。`,
      createdAt: now,
    });
  }

  return notes;
}
