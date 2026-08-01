/**
 * Portfolio Risk —— 数据驱动的组合风险评估（Phase 6.4 第五项支撑）。
 * 确定性规则纯函数（非固定话术）：结合持仓结构 + 组合波动 + 市场状态，
 * 输出集中风险 / 市场风险 / 流动性风险 / 波动风险信号，全部引用真实数字。
 */

import type { MarketRiskSignal, MarketSnapshot, RiskSeverity } from "@/market/types";
import type {
  PortfolioAnalysis,
  PortfolioPerformance,
  PortfolioRiskAssessment,
} from "./types";

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

const SEVERITY_SCORE: Record<RiskSeverity, number> = { low: 8, medium: 20, high: 35 };

/** 空风险评估 */
export const EMPTY_PORTFOLIO_RISK: PortfolioRiskAssessment = {
  score: 0,
  level: "low",
  signals: [],
};

/**
 * 组合风险评估：
 * - 集中风险：单只持仓占投资资产比例过高
 * - 流动性风险：现金占总资产比例不足
 * - 波动风险：组合年化波动率 / 最大回撤偏高
 * - 市场风险：市场整体回调叠加高权益仓位
 */
export function assessPortfolioRisk(
  analysis: PortfolioAnalysis,
  performance: PortfolioPerformance,
  market?: MarketSnapshot | null,
): PortfolioRiskAssessment {
  if (!analysis.hasData) return EMPTY_PORTFOLIO_RISK;

  const signals: MarketRiskSignal[] = [];

  /* ------ 集中风险 ------ */
  const { top1Ratio, hhi, level: concLevel } = analysis.concentration;
  if (concLevel !== "low" && analysis.investedValue > 0) {
    signals.push({
      type: "concentration",
      severity: concLevel,
      title: "持仓集中度偏高",
      detail: `最大单只持仓占投资资产 ${pct(top1Ratio)}，组合 HHI 集中度指数 ${hhi.toFixed(2)}，建议关注分散度。`,
      metric: top1Ratio,
    });
  }

  /* ------ 流动性风险 ------ */
  if (analysis.cashRatio < 0.1 && analysis.totalValue > 0) {
    const severity: RiskSeverity = analysis.cashRatio < 0.05 ? "high" : "medium";
    signals.push({
      type: "liquidity",
      severity,
      title: "现金缓冲不足",
      detail: `现金占总资产仅 ${pct(analysis.cashRatio)}，低于 10% 的常见流动性缓冲水平，应急能力偏弱。`,
      metric: analysis.cashRatio,
    });
  }

  /* ------ 波动风险 ------ */
  if (performance.volatility !== null && performance.volatility >= 0.15) {
    const severity: RiskSeverity = performance.volatility >= 0.25 ? "high" : "medium";
    const ddText =
      performance.maxDrawdown !== null ? `，区间最大回撤 ${pct(performance.maxDrawdown)}` : "";
    signals.push({
      type: "volatility",
      severity,
      title: "组合波动偏高",
      detail: `组合年化波动率 ${pct(performance.volatility)}${ddText}，高于稳健型组合的常见水平。`,
      metric: performance.volatility,
    });
  }

  /* ------ 市场风险 ------ */
  const equityRatio =
    analysis.totalValue > 0 ? (analysis.investedValue / analysis.totalValue) : 0;
  if (market && market.status !== "unavailable" && market.sentiment === "down" && equityRatio >= 0.5) {
    const worst = [...market.indices].sort((a, b) => a.changeRate - b.changeRate)[0];
    const severity: RiskSeverity = equityRatio >= 0.75 ? "high" : "medium";
    signals.push({
      type: "market",
      severity,
      title: "市场回调叠加高仓位",
      detail: `当前市场整体回调（${worst ? `${worst.name} ${pct(worst.changeRate)}` : "主要指数下行"}），而投资类资产占总资产 ${pct(equityRatio)}，短期净值波动可能加大。`,
      metric: equityRatio,
    });
  }

  /* ------ 汇总评分（0~100，越高越危险） ------ */
  const raw = signals.reduce((s, sig) => s + SEVERITY_SCORE[sig.severity], 0);
  const score = Math.min(100, raw);
  const level: RiskSeverity = score >= 55 ? "high" : score >= 25 ? "medium" : "low";

  return { score, level, signals };
}
