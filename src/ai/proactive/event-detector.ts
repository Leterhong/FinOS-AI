import "server-only";

/**
 * Phase 6.8 Proactive Event Detector。
 * 复用 Phase 4 的 detectFinancialEvents（9 类事件），并补充两类主动监测事件：
 *  - expense-consecutive：连续 3 期支出上升（基于历史运行快照趋势）；
 *  - investment-concentration：投资过度集中于单一资产类别。
 * 全部为确定性代码规则，不调用 LLM（需求十三：成本控制）。
 */

import type { FinancialProfile } from "@/data/types";
import type { TwinSnapshot } from "@/twin/engine";
import {
  detectFinancialEvents,
  type DetectOptions,
} from "@/ai/monitoring/detector";
import type { FinancialAlert } from "@/ai/monitoring/types";

/** 投资集中度阈值：单一类别占投资资产比例超过该值触发提醒。 */
const CONCENTRATION_THRESHOLD = 0.7;
/** critical 阈值：占比超过 85% 视为严重集中。 */
const CONCENTRATION_CRITICAL = 0.85;
/** 投资资产至少占总资产该比例，集中度才有实际风险意义。 */
const MIN_INVEST_SHARE = 0.2;

export interface ProactiveDetectOptions extends DetectOptions {
  /**
   * 历史月支出序列（旧 → 新，不含当前画像值）。
   * 通常来自 proactive 运行日志快照；不足 2 期时跳过趋势检测。
   */
  expenseHistory?: number[];
}

/**
 * 主动事件检测：底层 9 类 + Phase 6.8 新增 2 类。
 */
export function detectProactiveEvents(
  profile: FinancialProfile,
  twin: TwinSnapshot,
  opts: ProactiveDetectOptions = {}
): FinancialAlert[] {
  const alerts = detectFinancialEvents(profile, twin, opts);
  const now = Date.now();

  // ── 10) 连续三期支出上升（趋势检测） ──
  const hist = (opts.expenseHistory ?? []).filter((n) => n > 0);
  const series = [...hist, profile.monthlyExpenses].filter((n) => n > 0);
  if (series.length >= 3) {
    const last3 = series.slice(-3);
    const strictlyRising = last3[0] < last3[1] && last3[1] < last3[2];
    if (strictlyRising) {
      const first = last3[0];
      const last = last3[2];
      const change = first > 0 ? (last - first) / first : 0;
      alerts.push({
        id: "expense-consecutive",
        type: "expense-consecutive",
        severity: change >= 0.2 ? "critical" : "warn",
        title: "支出连续上升",
        message: `月支出已连续 3 期上升（¥${first.toLocaleString()} → ¥${last.toLocaleString()}，累计 +${(
          change * 100
        ).toFixed(0)}%）。支出趋势性上涨会持续侵蚀储蓄率，建议逐项排查新增开支并设定月度预算上限。`,
        metric: "月支出趋势",
        before: first,
        after: last,
        changePct: change,
        detectedAt: now,
      });
    }
  }

  // ── 11) 投资集中度过高（静态检测） ──
  const classes: Array<{ label: string; value: number }> = [
    { label: "股票", value: profile.stockPortfolio },
    { label: "基金", value: profile.funds },
    { label: "债券", value: profile.bonds },
    { label: "加密资产", value: profile.crypto },
  ];
  const investTotal = classes.reduce((s, c) => s + c.value, 0);
  const grandTotal =
    investTotal +
    profile.cashSavings +
    profile.realEstate +
    profile.house +
    profile.insurance;
  if (
    investTotal > 0 &&
    grandTotal > 0 &&
    investTotal / grandTotal >= MIN_INVEST_SHARE
  ) {
    const top = classes.reduce((a, b) => (b.value > a.value ? b : a));
    const ratio = top.value / investTotal;
    if (ratio >= CONCENTRATION_THRESHOLD) {
      alerts.push({
        id: "investment-concentration",
        type: "investment-concentration",
        severity: ratio >= CONCENTRATION_CRITICAL ? "critical" : "warn",
        title: "投资过度集中",
        message: `${top.label}占投资资产 ${(ratio * 100).toFixed(
          0
        )}%（¥${top.value.toLocaleString()} / ¥${investTotal.toLocaleString()}），单一类别波动将直接冲击整体财富。建议分散至至少 2-3 类资产，单类占比控制在 60% 以内。`,
        metric: `${top.label}集中度`,
        before: CONCENTRATION_THRESHOLD,
        after: ratio,
        changePct: ratio - CONCENTRATION_THRESHOLD,
        detectedAt: now,
      });
    }
  }

  return alerts;
}
