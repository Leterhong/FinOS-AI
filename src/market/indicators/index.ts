/**
 * Market Indicators —— 量化指标纯函数（Phase 6.4 第四项支撑）。
 * 全部为确定性纯函数，不依赖 LLM / 网络 / 时间副作用，保证验收可测。
 * 约定：比例值统一按小数存储（0.05 = 5%）。
 */

import type { HistoryPoint, PeriodChanges, SecurityIndicators } from "@/market/types";

/** 单年交易日数（年化用） */
const TRADING_DAYS = 252;

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** 区间涨跌幅：最近 lookbackDays 个自然日的价格变动（数据不足返回 null） */
export function computeChange(history: HistoryPoint[], lookbackDays: number): number | null {
  if (history.length < 2 || lookbackDays < 1) return null;
  const end = history[history.length - 1];
  // history 按日期升序；从尾部向前找 lookbackDays 天前（或最早）的点
  const endDate = new Date(end.date).getTime();
  const targetTime = endDate - lookbackDays * 24 * 60 * 60 * 1000;
  let start = history[0];
  for (let i = history.length - 2; i >= 0; i--) {
    start = history[i];
    if (new Date(history[i].date).getTime() <= targetTime) break;
  }
  if (start.price <= 0) return null;
  return round4((end.price - start.price) / start.price);
}

/** 日 / 周 / 月 / 年区间涨跌幅 */
export function computePeriodChanges(history: HistoryPoint[]): PeriodChanges {
  return {
    day: computeChange(history, 1),
    week: computeChange(history, 7),
    month: computeChange(history, 30),
    year: computeChange(history, 365),
  };
}

/** 日收益率序列 */
export function dailyReturns(history: HistoryPoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1].price;
    if (prev > 0) out.push((history[i].price - prev) / prev);
  }
  return out;
}

/** 年化收益率（几何年化；数据不足 2 点返回 null） */
export function annualizedReturn(history: HistoryPoint[]): number | null {
  if (history.length < 2) return null;
  const first = history[0];
  const last = history[history.length - 1];
  if (first.price <= 0) return null;
  const days = Math.max(
    1,
    (new Date(last.date).getTime() - new Date(first.date).getTime()) / (24 * 60 * 60 * 1000),
  );
  const total = last.price / first.price;
  if (total <= 0) return null;
  return round4(Math.pow(total, 365 / days) - 1);
}

/** 年化波动率（日收益率标准差 × √252；样本不足返回 null） */
export function annualizedVolatility(history: HistoryPoint[]): number | null {
  const returns = dailyReturns(history);
  if (returns.length < 2) return null;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance =
    returns.reduce((s, r) => s + (r - mean) * (r - mean), 0) / (returns.length - 1);
  return round4(Math.sqrt(variance) * Math.sqrt(TRADING_DAYS));
}

/** 最大回撤（0~1 正数；数据不足返回 null） */
export function maxDrawdown(history: HistoryPoint[]): number | null {
  if (history.length < 2) return null;
  let peak = -Infinity;
  let maxDd = 0;
  for (const p of history) {
    if (p.price > peak) peak = p.price;
    if (peak > 0) {
      const dd = (peak - p.price) / peak;
      if (dd > maxDd) maxDd = dd;
    }
  }
  return round4(maxDd);
}

/** 风险收益比 = 年化收益 / 年化波动率（波动率为 0 或缺数据返回 null） */
export function riskReturnRatio(
  annualReturn: number | null,
  volatility: number | null,
): number | null {
  if (annualReturn === null || volatility === null || volatility <= 0) return null;
  return round4(annualReturn / volatility);
}

/** 一站式指标计算：给定历史序列，输出全套 SecurityIndicators */
export function computeIndicators(history: HistoryPoint[]): SecurityIndicators {
  const ret = annualizedReturn(history);
  const vol = annualizedVolatility(history);
  return {
    changes: computePeriodChanges(history),
    annualizedReturn: ret,
    volatility: vol,
    maxDrawdown: maxDrawdown(history),
    riskReturnRatio: riskReturnRatio(ret, vol),
  };
}
