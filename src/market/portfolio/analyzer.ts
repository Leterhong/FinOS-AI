/**
 * Portfolio Analyzer —— 投资组合配置分析（Phase 6.4 第三项）。
 * 确定性纯函数：只依赖入参持仓，不依赖 LLM / 网络 / 时间。
 */

import type { AssetAllocationSlice, AssetHolding } from "@/financial-data/types";
import { HOLDING_TYPE_LABELS } from "@/financial-data/types";
import type { RiskSeverity } from "@/market/types";
import { lookupSecurityMeta } from "./metadata";
import type {
  AllocationSlice,
  ConcentrationInfo,
  PortfolioAnalysis,
  TopHolding,
} from "./types";

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** 空组合分析（无持仓时的优雅降级） */
export const EMPTY_PORTFOLIO_ANALYSIS: PortfolioAnalysis = {
  hasData: false,
  totalValue: 0,
  investedValue: 0,
  cashValue: 0,
  cashRatio: 0,
  byClass: [],
  bySector: [],
  byRegion: [],
  topHoldings: [],
  concentration: { top1Ratio: 0, top3Ratio: 0, hhi: 0, level: "low" },
  holdingCount: 0,
};

/** 通用聚合：按 key 累加市值并转配置切片（按值降序） */
function aggregate(
  entries: Array<{ key: string; label: string; value: number }>,
  total: number,
): AllocationSlice[] {
  const map = new Map<string, AllocationSlice>();
  for (const e of entries) {
    if (e.value <= 0) continue;
    const cur = map.get(e.key);
    if (cur) {
      cur.value += e.value;
    } else {
      map.set(e.key, { key: e.key, label: e.label, value: e.value, ratio: 0 });
    }
  }
  const out = [...map.values()].sort((a, b) => b.value - a.value);
  for (const s of out) s.ratio = total > 0 ? round4(s.value / total) : 0;
  return out;
}

/** 集中度评估（对投资类持仓，不含现金） */
function computeConcentration(invested: AssetHolding[], investedValue: number): ConcentrationInfo {
  if (invested.length === 0 || investedValue <= 0) {
    return { top1Ratio: 0, top3Ratio: 0, hhi: 0, level: "low" };
  }
  const ratios = invested
    .map((h) => h.marketValue / investedValue)
    .sort((a, b) => b - a);
  const top1 = ratios[0] ?? 0;
  const top3 = ratios.slice(0, 3).reduce((s, r) => s + r, 0);
  const hhi = ratios.reduce((s, r) => s + r * r, 0);
  const level: RiskSeverity = top1 >= 0.5 || hhi >= 0.4 ? "high" : top1 >= 0.3 || hhi >= 0.25 ? "medium" : "low";
  return {
    top1Ratio: round4(top1),
    top3Ratio: round4(top3),
    hhi: round4(hhi),
    level,
  };
}

/**
 * 组合配置分析：资产类别 / 行业 / 地区分布、Top 持仓、集中度。
 * 现金类（cash）单列，投资类集中度不含现金。
 */
export function analyzePortfolio(holdings: AssetHolding[]): PortfolioAnalysis {
  const valid = holdings.filter((h) => h.marketValue > 0);
  if (valid.length === 0) return EMPTY_PORTFOLIO_ANALYSIS;

  const totalValue = valid.reduce((s, h) => s + h.marketValue, 0);
  const cashHoldings = valid.filter((h) => h.type === "cash");
  const invested = valid.filter((h) => h.type !== "cash");
  const cashValue = cashHoldings.reduce((s, h) => s + h.marketValue, 0);
  const investedValue = totalValue - cashValue;

  /* 按资产类别 */
  const byClass: AssetAllocationSlice[] = aggregate(
    valid.map((h) => ({
      key: h.type,
      label: HOLDING_TYPE_LABELS[h.type],
      value: h.marketValue,
    })),
    totalValue,
  ).map((s) => ({
    type: s.key as AssetHolding["type"],
    label: s.label,
    value: s.value,
    ratio: s.ratio,
  }));

  /* 按行业 / 地区（含现金，现金归「现金」/「中国」） */
  const metas = valid.map((h) => ({ holding: h, meta: lookupSecurityMeta(h.type, h.code) }));
  const bySector = aggregate(
    metas.map(({ holding, meta }) => ({ key: meta.sector, label: meta.sector, value: holding.marketValue })),
    totalValue,
  );
  const byRegion = aggregate(
    metas.map(({ holding, meta }) => ({ key: meta.region, label: meta.region, value: holding.marketValue })),
    totalValue,
  );

  /* Top 持仓（投资类，按市值降序，前 5） */
  const topHoldings: TopHolding[] = [...invested]
    .sort((a, b) => b.marketValue - a.marketValue)
    .slice(0, 5)
    .map((h) => ({
      name: h.name,
      code: h.code,
      type: h.type,
      marketValue: h.marketValue,
      ratio: totalValue > 0 ? round4(h.marketValue / totalValue) : 0,
      returnRate: h.returnRate,
    }));

  return {
    hasData: true,
    totalValue,
    investedValue,
    cashValue,
    cashRatio: totalValue > 0 ? round4(cashValue / totalValue) : 0,
    byClass,
    bySector,
    byRegion,
    topHoldings,
    concentration: computeConcentration(invested, investedValue),
    holdingCount: valid.length,
  };
}
