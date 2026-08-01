import "server-only";

import type { FinancialProfile } from "@/data/types";
import { computeCashFlow, computeRiskMetrics } from "@/scenario/scenario-engine";
import type { TwinSnapshot } from "@/twin/engine";
import type { FinancialAlert } from "./types";

/** 变化检测所需的"上一期"基准。 */
export interface DetectOptions {
  /** 上一期画像（用于收入 / 支出 / 储蓄率变化检测）。 */
  prevProfile?: FinancialProfile | null;
  /** 上一期 Twin 快照（用于资产下降 / 风险上升检测）。 */
  prevSnapshot?: TwinSnapshot | null;
}

function dimScore(
  twin: TwinSnapshot,
  key: "cashflow" | "growth" | "risk" | "goal" | "protection"
): number {
  return twin.health.dimensions.find((d) => d.key === key)?.score ?? 0;
}

function pct(before: number, after: number): number {
  if (before === 0) return 0;
  return (after - before) / before;
}

/**
 * Financial Event Detection（Phase 4 二）。
 * 自动识别异常事件：收入下降 / 支出增加 / 储蓄率下降 / 资产下降 / 风险提升 /
 * 目标延期 / 应急金不足 / 保障缺口。
 *
 * 检测分为两类：
 *  - 静态检测：不依赖历史，仅看当前画像（应急金 / 目标延期 / 保障缺口）。
 *  - 变化检测：需要 prevProfile / prevSnapshot 才能判定"下降 / 上升"。
 */
export function detectFinancialEvents(
  profile: FinancialProfile,
  twin: TwinSnapshot,
  opts: DetectOptions = {}
): FinancialAlert[] {
  const alerts: FinancialAlert[] = [];
  const now = Date.now();
  const cf = computeCashFlow(profile);
  const risk = computeRiskMetrics(profile);
  const emergencyMonths = cf.expenses > 0 ? profile.cashSavings / cf.expenses : 0;

  // ── 1) 收入下降（变化检测） ──
  if (opts.prevProfile && opts.prevProfile.monthlySalary > 0) {
    const before = opts.prevProfile.monthlySalary;
    const after = profile.monthlySalary;
    const change = pct(before, after);
    if (change <= -0.05) {
      alerts.push({
        id: "income-drop",
        type: "income-drop",
        severity: change <= -0.2 ? "critical" : "warn",
        title: "收入下降",
        message: `月收入由 ¥${before.toLocaleString()} 降至 ¥${after.toLocaleString()}，降幅 ${Math.abs(
          change * 100
        ).toFixed(0)}%。建议重新评估储蓄率与投资计划，避免拖累退休目标。`,
        metric: "月收入",
        before,
        after,
        changePct: change,
        detectedAt: now,
      });
    }
  }

  // ── 2) 支出增加（变化检测） ──
  if (opts.prevProfile && opts.prevProfile.monthlyExpenses > 0) {
    const before = opts.prevProfile.monthlyExpenses;
    const after = profile.monthlyExpenses;
    const change = pct(before, after);
    if (change >= 0.1) {
      alerts.push({
        id: "expense-increase",
        type: "expense-increase",
        severity: change >= 0.3 ? "critical" : "warn",
        title: "支出增加",
        message: `月支出由 ¥${before.toLocaleString()} 升至 ¥${after.toLocaleString()}，增幅 ${(
          change * 100
        ).toFixed(0)}%。注意控制非必要开支，维持正向现金流。`,
        metric: "月支出",
        before,
        after,
        changePct: change,
        detectedAt: now,
      });
    }
  }

  // ── 3) 储蓄率下降（变化检测） ──
  if (opts.prevProfile) {
    const prevCf = computeCashFlow(opts.prevProfile);
    if (cf.savingsRate < prevCf.savingsRate - 3) {
      const drop = prevCf.savingsRate - cf.savingsRate;
      alerts.push({
        id: "savings-rate-drop",
        type: "savings-rate-drop",
        severity: cf.savingsRate < 10 ? "critical" : "warn",
        title: "储蓄率下降",
        message: `储蓄率由 ${prevCf.savingsRate.toFixed(
          1
        )}% 降至 ${cf.savingsRate.toFixed(1)}%（下降 ${drop.toFixed(
          1
        )} 个百分点）。储蓄率是退休复利的根基，建议优先修复。`,
        metric: "储蓄率",
        before: prevCf.savingsRate,
        after: cf.savingsRate,
        changePct: prevCf.savingsRate ? -drop / prevCf.savingsRate : 0,
        detectedAt: now,
      });
    }
  }

  // ── 4) 资产下降（变化检测） ──
  if (opts.prevSnapshot) {
    const before = opts.prevSnapshot.totalAssets;
    const after = twin.totalAssets;
    const change = pct(before, after);
    if (change <= -0.02) {
      alerts.push({
        id: "asset-drop",
        type: "asset-drop",
        severity: change <= -0.1 ? "critical" : "warn",
        title: "资产下降",
        message: `总资产由 ¥${before.toLocaleString()} 降至 ¥${after.toLocaleString()}，降幅 ${Math.abs(
          change * 100
        ).toFixed(1)}%。建议复盘投资组合与现金流来源。`,
        metric: "总资产",
        before,
        after,
        changePct: change,
        detectedAt: now,
      });
    }
  }

  // ── 5) 风险提升（变化检测） ──
  if (opts.prevSnapshot) {
    const prevRisk = dimScore(opts.prevSnapshot, "risk");
    const curRisk = dimScore(twin, "risk");
    if (curRisk < prevRisk - 5) {
      alerts.push({
        id: "risk-increase",
        type: "risk-increase",
        severity: "warn",
        title: "风险提升",
        message: `综合风险健康分由 ${prevRisk.toFixed(0)} 降至 ${curRisk.toFixed(
          0
        )}。组合波动或负债上升，建议检视高波动资产与保障覆盖。`,
        metric: "风险健康分",
        before: prevRisk,
        after: curRisk,
        changePct: prevRisk ? (curRisk - prevRisk) / prevRisk : 0,
        detectedAt: now,
      });
    }
  }

  // ── 6) 应急金不足（静态检测） ──
  if (emergencyMonths < 6) {
    alerts.push({
      id: "emergency-fund-low",
      type: "emergency-fund-low",
      severity: emergencyMonths < 3 ? "critical" : "warn",
      title: "应急资金不足",
      message: `现金仅覆盖 ${emergencyMonths.toFixed(
        1
      )} 个月支出，低于 6 个月安全线。建议保留 6 个月生活费的应急金以应对突发支出。`,
      detectedAt: now,
    });
  }

  // ── 7) 目标延期（静态检测） ──
  if (!twin.onTrack) {
    alerts.push({
      id: "goal-delay",
      type: "goal-delay",
      severity: "warn",
      title: "退休目标可能延期",
      message: `按当前轨迹将在 ${twin.projectedRetireAge} 岁退休，比目标 ${
        profile.goal.retirementAge
      } 岁晚 ${Math.abs(twin.retireGapYears)} 年。建议提升投资额或延长供款期。`,
      detectedAt: now,
    });
  }

  // ── 8) 保障缺口（静态检测） ──
  const coverage = profile.totalAssets > 0 ? profile.insurance / profile.totalAssets : 0;
  if (coverage < 0.05 && profile.liabilities > 0) {
    alerts.push({
      id: "insurance-gap",
      type: "insurance-gap",
      severity: "warn",
      title: "保障缺口",
      message: `保险资产仅占 ${(
        coverage * 100
      ).toFixed(1)}%，但存在 ¥${profile.liabilities.toLocaleString()} 负债。建议配置足额寿险 / 重疾险以覆盖风险敞口。`,
      detectedAt: now,
    });
  }

  // ── 9) 资产配置偏离（静态检测，仅信息级） ──
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
  if (cashRatio > 0.5 && profile.riskLevel !== "conservative") {
    alerts.push({
      id: "allocation-deviation",
      type: "allocation-deviation",
      severity: "info",
      title: "现金占比偏高",
      message: `现金占资产 ${(cashRatio * 100).toFixed(
        0
      )}%，长期收益受限。可适当增配权益 / 基金类资产以提升复利效率。`,
      detectedAt: now,
    });
  }

  return alerts;
}
