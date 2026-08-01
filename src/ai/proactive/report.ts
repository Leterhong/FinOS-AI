import "server-only";

/**
 * Phase 6.8 每日简报 / 每周财富报告（需求七）。
 * 全部为确定性代码生成（不调 LLM，需求十三）；
 * 深度 AI 解读由分级 Advisor 在有异常时按需提供。
 */

import type { FinancialProfile } from "@/data/types";
import type { TwinSnapshot } from "@/twin/engine";
import { computeCashFlow } from "@/scenario/scenario-engine";
import { proactiveStore } from "./notification";
import type { DailyBrief, ProactiveResult, WeeklyReport } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

function dateStr(ts: number): string {
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 每日财富简报：今日状态 / 最近变化 / 需要注意 / 建议动作。 */
export function buildDailyBrief(result: ProactiveResult): DailyBrief {
  const { monitoring, events, advice } = result;
  const critical = events.filter((e) => e.severity === "critical");
  const warns = events.filter((e) => e.severity === "warn");

  const headline =
    critical.length > 0
      ? `发现 ${critical.length} 项高风险事件，需要立即处理。`
      : warns.length > 0
        ? `发现 ${warns.length} 项需要关注的变化，整体可控。`
        : `财富状态平稳，健康分 ${monitoring.healthScore}，一切按计划推进。`;

  return {
    date: dateStr(result.ranAt),
    headline,
    changes: monitoring.briefing.changes,
    attention: [...critical, ...warns].slice(0, 5).map((e) => e.title),
    suggestion:
      advice?.text.split("\n")[0] ??
      monitoring.briefing.topActions[0] ??
      "保持当前储蓄与投资节奏，无需额外动作。",
    healthScore: monitoring.healthScore,
    netWorth: monitoring.netWorth,
    generatedAt: Date.now(),
  };
}

/** 每周财富报告：资产 / 收支 / 投资 / 目标 + 建议清单。 */
export function buildWeeklyReport(
  userId: string,
  profile: FinancialProfile,
  twin: TwinSnapshot,
  result: ProactiveResult
): WeeklyReport {
  const cf = computeCashFlow(profile);
  const logs = proactiveStore.listRunLogs(userId);
  const weekAgo = Date.now() - 7 * DAY_MS;
  const baseline = [...logs].reverse().find((l) => l.runAt <= weekAgo) ?? null;

  const assetDelta = baseline ? twin.netWorth - baseline.netWorth : 0;
  const assetSummary = baseline
    ? `净资产 ¥${twin.netWorth.toLocaleString()}，较上周${
        assetDelta >= 0 ? "增加" : "减少"
      } ¥${Math.abs(assetDelta).toLocaleString()}。`
    : `净资产 ¥${twin.netWorth.toLocaleString()}（首期报告，暂无上周对比基准）。`;

  const incomeExpenseSummary = `月收入 ¥${profile.monthlySalary.toLocaleString()}，月支出 ¥${profile.monthlyExpenses.toLocaleString()}，储蓄率 ${cf.savingsRate.toFixed(1)}%。`;

  const investTotal =
    profile.stockPortfolio + profile.funds + profile.bonds + profile.crypto;
  const investmentSummary =
    investTotal > 0
      ? `投资资产合计 ¥${investTotal.toLocaleString()}（股票 ¥${profile.stockPortfolio.toLocaleString()} / 基金 ¥${profile.funds.toLocaleString()} / 债券 ¥${profile.bonds.toLocaleString()} / 加密 ¥${profile.crypto.toLocaleString()}），月定投 ¥${profile.monthlyInvestment.toLocaleString()}。`
      : "暂无投资资产，当前财富以现金及固定资产为主。";

  const goalSummary = twin.onTrack
    ? `退休目标（${profile.goal.retirementAge} 岁 / ¥${profile.goal.targetAmount.toLocaleString()}）在轨，预计 ${twin.projectedRetireAge} 岁达成。`
    : `退休目标预计推迟至 ${twin.projectedRetireAge} 岁（目标 ${profile.goal.retirementAge} 岁），建议检视储蓄率与投资强度。`;

  const aiSuggestions = result.advice
    ? result.advice.text
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 5)
    : result.monitoring.briefing.topActions.slice(0, 5);

  return {
    weekOf: dateStr(Date.now() - 6 * DAY_MS),
    assetSummary,
    incomeExpenseSummary,
    investmentSummary,
    goalSummary,
    aiSuggestions,
    healthScore: twin.health.total,
    netWorth: twin.netWorth,
    generatedAt: Date.now(),
  };
}
