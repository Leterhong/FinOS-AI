/**
 * Performance Engine —— 组合收益分析（Phase 6.4 第四项）。
 * 确定性纯函数：基于各持仓历史价格合成组合净值序列，
 * 计算日 / 周 / 月 / 年收益、最大回撤、年化波动率、风险收益比。
 */

import type { AssetHolding } from "@/financial-data/types";
import {
  annualizedReturn,
  annualizedVolatility,
  computePeriodChanges,
  maxDrawdown,
  riskReturnRatio,
} from "@/market/indicators";
import type { HistoryPoint } from "@/market/types";
import type { PortfolioPerformance } from "./types";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** 空收益分析（无数据时的优雅降级） */
export const EMPTY_PORTFOLIO_PERFORMANCE: PortfolioPerformance = {
  hasData: false,
  series: [],
  changes: { day: null, week: null, month: null, year: null },
  annualizedReturn: null,
  volatility: null,
  maxDrawdown: null,
  riskReturnRatio: null,
  totalProfit: 0,
  totalReturnRate: null,
  simulated: false,
};

/** 单持仓的历史输入（由 server 编排层取数后传入） */
export interface HoldingHistoryEntry {
  /** 当前市值（加权锚点） */
  marketValue: number;
  /** 历史价格序列（可为空 —— 现金等无行情资产按恒定市值处理） */
  history: HistoryPoint[];
  /** 历史数据是否为模拟行情 */
  simulated?: boolean;
}

/**
 * 合成组合净值序列。
 * 方法：以「最新价格 = 当前市值」为锚，将每只持仓的历史价格换算为历史市值
 * （value_t = marketValue × price_t / price_latest），按日期对齐求和；
 * 无历史数据的持仓（如现金）按恒定市值参与，缺失日期向前填充。
 */
export function composePortfolioSeries(entries: HoldingHistoryEntry[]): HistoryPoint[] {
  const active = entries.filter((e) => e.marketValue > 0);
  if (active.length === 0) return [];

  /* 收集全部日期（升序去重） */
  const dateSet = new Set<string>();
  for (const e of active) for (const p of e.history) dateSet.add(p.date);
  const dates = [...dateSet].sort();
  if (dates.length === 0) return [];

  /* 每只持仓：date → 历史市值（前向填充；序列开始前用首个价格） */
  const valueMaps = active.map((e) => {
    const map = new Map<string, number>();
    if (e.history.length === 0) {
      // 无行情资产：恒定市值
      for (const d of dates) map.set(d, e.marketValue);
      return map;
    }
    const sorted = [...e.history].sort((a, b) => (a.date < b.date ? -1 : 1));
    const anchor = sorted[sorted.length - 1].price;
    if (anchor <= 0) {
      for (const d of dates) map.set(d, e.marketValue);
      return map;
    }
    let idx = 0;
    let lastPrice = sorted[0].price;
    for (const d of dates) {
      while (idx < sorted.length && sorted[idx].date <= d) {
        lastPrice = sorted[idx].price;
        idx++;
      }
      map.set(d, e.marketValue * (lastPrice / anchor));
    }
    return map;
  });

  return dates.map((date) => ({
    date,
    price: round2(valueMaps.reduce((s, m) => s + (m.get(date) ?? 0), 0)),
  }));
}

/**
 * 组合收益分析：合成净值序列 → 区间收益 / 年化收益 / 波动率 / 最大回撤 / 风险收益比。
 * totalProfit / totalReturnRate 来自持仓成本数据（与行情无关）。
 */
export function computePortfolioPerformance(
  holdings: AssetHolding[],
  entries: HoldingHistoryEntry[],
): PortfolioPerformance {
  const series = composePortfolioSeries(entries);
  const valid = holdings.filter((h) => h.marketValue > 0);

  /* 成本口径盈亏（仅统计有成本数据的持仓） */
  const withCost = valid.filter((h) => typeof h.totalCost === "number" && h.totalCost! > 0);
  const totalProfit = valid.reduce((s, h) => s + (h.profit ?? 0), 0);
  const totalCost = withCost.reduce((s, h) => s + (h.totalCost ?? 0), 0);
  const costProfit = withCost.reduce((s, h) => s + (h.profit ?? 0), 0);
  const totalReturnRate = totalCost > 0 ? round4(costProfit / totalCost) : null;

  if (series.length < 2) {
    return {
      ...EMPTY_PORTFOLIO_PERFORMANCE,
      hasData: valid.length > 0,
      series,
      totalProfit: round2(totalProfit),
      totalReturnRate,
      simulated: entries.some((e) => e.simulated === true),
    };
  }

  const ret = annualizedReturn(series);
  const vol = annualizedVolatility(series);
  return {
    hasData: true,
    series,
    changes: computePeriodChanges(series),
    annualizedReturn: ret,
    volatility: vol,
    maxDrawdown: maxDrawdown(series),
    riskReturnRatio: riskReturnRatio(ret, vol),
    totalProfit: round2(totalProfit),
    totalReturnRate,
    simulated: entries.some((e) => e.simulated === true),
  };
}
