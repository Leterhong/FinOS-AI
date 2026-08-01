/**
 * Market AI Context —— 将投资报告转换为 LLM 可消费的 marketData 上下文（纯函数）。
 * 供 WorkflowEngine 在 market 授权作用域下注入 FinancialContextData.marketData。
 */

import type { FinancialContextData } from "@/ai/types";
import type {
  PortfolioAnalysis,
  PortfolioPerformance,
  PortfolioRiskAssessment,
} from "@/market/portfolio";
import type { MarketSnapshot } from "@/market/types";

type MarketDataContext = NonNullable<FinancialContextData["marketData"]>;

export interface MarketContextInput {
  analysis: PortfolioAnalysis;
  performance: PortfolioPerformance;
  risk: PortfolioRiskAssessment;
  market: MarketSnapshot;
  generatedAt: string;
}

/** 投资报告 → marketData 上下文（市场不可用且无持仓时返回 undefined，不注入） */
export function toMarketDataContext(report: MarketContextInput): MarketDataContext | undefined {
  const { analysis, performance, risk, market } = report;
  if (market.status === "unavailable" && !analysis.hasData) return undefined;

  const portfolio: MarketDataContext["portfolio"] = analysis.hasData
    ? {
        totalValue: analysis.totalValue,
        investedValue: analysis.investedValue,
        cashRatio: analysis.cashRatio,
        byClass: analysis.byClass.map((s) => ({
          label: s.label,
          value: s.value,
          ratio: s.ratio,
        })),
        bySector: analysis.bySector.map((s) => ({ label: s.label, ratio: s.ratio })),
        topHoldings: analysis.topHoldings.map((h) => ({
          name: h.name,
          ratio: h.ratio,
          returnRate: h.returnRate,
        })),
        concentration: {
          top1Ratio: analysis.concentration.top1Ratio,
          level: analysis.concentration.level,
        },
        performance: {
          monthChange: performance.changes.month,
          annualizedReturn: performance.annualizedReturn,
          volatility: performance.volatility,
          maxDrawdown: performance.maxDrawdown,
          riskReturnRatio: performance.riskReturnRatio,
        },
        riskScore: risk.score,
        riskLevel: risk.level,
        riskSignals: risk.signals.map((s) => ({
          type: s.type,
          severity: s.severity,
          title: s.title,
          detail: s.detail,
        })),
      }
    : undefined;

  return {
    status: market.status,
    simulated: market.simulated || performance.simulated,
    summary: market.summary,
    indices: market.indices.map((i) => ({
      code: i.code,
      name: i.name,
      value: i.value,
      changeRate: i.changeRate,
    })),
    portfolio,
    generatedAt: report.generatedAt,
  };
}
