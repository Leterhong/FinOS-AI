/**
 * Investment Twin —— 投资孪生（Phase 6.4 第七项，server-only）。
 * Financial Twin 的投资维度升级：过去 30 天的持仓变化 / 收益变化 / 风险变化 / 市场影响。
 * 全部基于确定性纯函数 + Market Intelligence Layer，行情缺失时优雅降级。
 */

import "server-only";

import { financeDb } from "@/financial-data/storage";
import { buildPortfolioReport } from "@/market/portfolio/service";
import type {
  PortfolioAnalysis,
  PortfolioPerformance,
  PortfolioRiskAssessment,
} from "@/market/portfolio";
import type { HistoryPoint, MarketSnapshot } from "@/market/types";

/** 投资孪生快照（30 天视图） */
export interface InvestmentTwin {
  hasData: boolean;
  /** 视图区间（天） */
  periodDays: number;
  /** 组合市值序列（30 天，合成净值） */
  series: HistoryPoint[];
  /** 区间市值变化率（数据不足为 null） */
  periodChange: number | null;
  /** 当前组合总值 */
  totalValue: number;
  /** 累计浮动盈亏 */
  totalProfit: number;
  /** 组合配置分析 */
  analysis: PortfolioAnalysis;
  /** 收益指标 */
  performance: PortfolioPerformance;
  /** 风险评估（0~100 评分 + 信号） */
  risk: PortfolioRiskAssessment;
  /** 市场快照（市场影响维度） */
  market: MarketSnapshot;
  /** 市场对组合的影响说明（引用真实数字） */
  marketImpact: string;
  /** 是否为模拟行情 */
  simulated: boolean;
  generatedAt: string;
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

/** 生成市场影响说明（数据驱动，模拟数据带标注由 market.summary 承担） */
function buildMarketImpact(
  analysis: PortfolioAnalysis,
  performance: PortfolioPerformance,
  market: MarketSnapshot,
): string {
  if (!analysis.hasData) return "暂无持仓数据，无法评估市场影响。";
  if (market.status === "unavailable") return "等待连接市场数据源，市场影响暂不可用。";
  const equityRatio =
    analysis.totalValue > 0 ? analysis.investedValue / analysis.totalValue : 0;
  const monthChange = performance.changes.month;
  const changeText =
    monthChange !== null ? `组合近 30 天变动 ${pct(monthChange)}` : "组合近 30 天变动数据不足";
  const toneText =
    market.sentiment === "up"
      ? "市场整体上行，对持仓形成支撑"
      : market.sentiment === "down"
        ? "市场整体回调，权益类持仓承压"
        : "市场涨跌分化，持仓表现取决于结构";
  return `${toneText}；投资类资产占总资产 ${pct(equityRatio)}，${changeText}。`;
}

/**
 * 构建用户的投资孪生（30 天视图）。
 * 无持仓 → hasData=false 的空孪生；行情失败 → 恒定市值降级，绝不抛错。
 */
export async function buildInvestmentTwin(
  userId: string,
  periodDays = 30,
): Promise<InvestmentTwin> {
  const holdings = financeDb.getHoldings(userId);
  const report = await buildPortfolioReport(holdings, periodDays);
  const { analysis, performance, risk, market } = report;

  return {
    hasData: analysis.hasData,
    periodDays,
    series: performance.series,
    periodChange: performance.changes.month,
    totalValue: analysis.totalValue,
    totalProfit: performance.totalProfit,
    analysis,
    performance,
    risk,
    market,
    marketImpact: buildMarketImpact(analysis, performance, market),
    simulated: performance.simulated || market.simulated,
    generatedAt: report.generatedAt,
  };
}
