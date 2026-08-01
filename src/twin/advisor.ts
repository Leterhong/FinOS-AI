import "server-only";

import type { FinancialProfile } from "@/data/types";
import { computeCashFlow, computeRiskMetrics } from "@/scenario/scenario-engine";
import type { TwinSnapshot } from "./engine";

/** AI 主动提醒（Phase 3.5 Advisor Scheduler）。 */
export interface AdvisorAlert {
  id: string;
  category: "cashflow" | "risk" | "goal" | "allocation";
  level: "critical" | "warn" | "info";
  title: string;
  message: string;
}

/**
 * 基于 Twin 快照主动发现风险与偏离，生成主动建议。
 * 检测：现金流下降 / 应急金不足 / 风险偏高 / 目标延期 / 资产配置偏离。
 */
export function generateAdvisorAlerts(
  profile: FinancialProfile,
  twin: TwinSnapshot
): AdvisorAlert[] {
  const alerts: AdvisorAlert[] = [];
  const cf = computeCashFlow(profile);
  const risk = computeRiskMetrics(profile);
  const totalAssets =
    profile.cashSavings +
    profile.stockPortfolio +
    profile.realEstate +
    profile.bonds +
    profile.crypto +
    profile.funds +
    profile.house +
    profile.insurance;
  const emergencyMonths = cf.expenses > 0 ? profile.cashSavings / cf.expenses : 0;
  const cashRatio = totalAssets > 0 ? profile.cashSavings / totalAssets : 0;

  // 现金流
  if (cf.savingsRate < 10) {
    alerts.push({
      id: "cf-low",
      category: "cashflow",
      level: "critical",
      title: "储蓄率过低",
      message: `当前储蓄率仅 ${cf.savingsRate.toFixed(1)}%，建议提升月储蓄或控制支出。`,
    });
  } else if (cf.savingsRate < 20) {
    alerts.push({
      id: "cf-warn",
      category: "cashflow",
      level: "warn",
      title: "储蓄率偏低",
      message: `储蓄率 ${cf.savingsRate.toFixed(1)}%，建议提高到 20% 以上以增强抗风险能力。`,
    });
  }

  // 应急金
  if (emergencyMonths < 3) {
    alerts.push({
      id: "cf-emergency",
      category: "cashflow",
      level: "critical",
      title: "应急资金缺口",
      message: `现金仅覆盖 ${emergencyMonths.toFixed(1)} 个月支出，建议保留 6 个月应急金。`,
    });
  }

  // 风险
  if (risk.overall < 40) {
    alerts.push({
      id: "risk-high",
      category: "risk",
      level: "warn",
      title: "风险偏高",
      message: `综合风险健康分 ${risk.overall}，建议降低高波动资产比例或增配保险。`,
    });
  }

  // 目标延期
  if (!twin.onTrack) {
    alerts.push({
      id: "goal-delay",
      category: "goal",
      level: "warn",
      title: "退休目标可能延期",
      message: `按当前轨迹将在 ${twin.projectedRetireAge} 岁退休，比目标晚 ${Math.abs(
        twin.retireGapYears
      )} 年，建议提升投资额或延长供款期。`,
    });
  }

  // 资产配置偏离
  if (cashRatio > 0.5) {
    alerts.push({
      id: "alloc-cash",
      category: "allocation",
      level: "info",
      title: "现金占比偏高",
      message: `现金占资产 ${(cashRatio * 100).toFixed(0)}%，长期收益受限，可适当增加权益类配置。`,
    });
  } else if (cashRatio < 0.05 && profile.riskLevel !== "aggressive") {
    alerts.push({
      id: "alloc-lowcash",
      category: "allocation",
      level: "info",
      title: "现金缓冲不足",
      message: `现金占比仅 ${(cashRatio * 100).toFixed(0)}%，建议保留少量流动性应对突发支出。`,
    });
  }

  return alerts;
}
