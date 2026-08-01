/**
 * Portfolio Service —— 组合分析编排层（server-only）。
 * 取持仓历史行情（带缓存）→ 纯函数计算配置 / 收益 / 风险 → 输出投资报告。
 * 供 Dashboard 投资中心 API 与 WorkflowEngine marketData 注入消费。
 */

import "server-only";

import type { AssetHolding } from "@/financial-data/types";
import { getFundHistory } from "@/market/fund";
import { getMarketSnapshot } from "@/market/intelligence";
import { getMarketProvider } from "@/market/providers";
import { getStockHistory } from "@/market/stock";
import type { MarketSnapshot } from "@/market/types";
import { analyzePortfolio } from "./analyzer";
import {
  computePortfolioPerformance,
  type HoldingHistoryEntry,
} from "./performance";
import { assessPortfolioRisk } from "./risk";
import type {
  PortfolioAnalysis,
  PortfolioPerformance,
  PortfolioRiskAssessment,
} from "./types";

/** 投资报告（配置 + 收益 + 风险 + 市场快照） */
export interface PortfolioReport {
  analysis: PortfolioAnalysis;
  performance: PortfolioPerformance;
  risk: PortfolioRiskAssessment;
  market: MarketSnapshot;
  generatedAt: string;
}

/** 历史回看天数（默认 90 天，覆盖月度视图；年度指标数据不足自动为 null） */
const DEFAULT_HISTORY_DAYS = 90;

/**
 * 构建投资报告。行情获取失败时对应持仓按恒定市值参与（优雅降级），绝不抛错。
 */
export async function buildPortfolioReport(
  holdings: AssetHolding[],
  historyDays = DEFAULT_HISTORY_DAYS,
): Promise<PortfolioReport> {
  const provider = getMarketProvider();
  const valid = holdings.filter((h) => h.marketValue > 0);

  /* 并行取有代码的股票 / 基金历史，其余（现金等）按恒定市值 */
  const entries: HoldingHistoryEntry[] = await Promise.all(
    valid.map(async (h): Promise<HoldingHistoryEntry> => {
      const code = h.code?.trim();
      if (!code || (h.type !== "stock" && h.type !== "fund")) {
        return { marketValue: h.marketValue, history: [], simulated: false };
      }
      try {
        const history =
          h.type === "stock"
            ? await getStockHistory(code, historyDays)
            : await getFundHistory(code, historyDays);
        return { marketValue: h.marketValue, history, simulated: provider.simulated };
      } catch {
        return { marketValue: h.marketValue, history: [], simulated: false };
      }
    }),
  );

  const market = await getMarketSnapshot();
  const analysis = analyzePortfolio(valid);
  const performance = computePortfolioPerformance(valid, entries);
  const risk = assessPortfolioRisk(analysis, performance, market);

  return {
    analysis,
    performance,
    risk,
    market,
    generatedAt: new Date().toISOString(),
  };
}
