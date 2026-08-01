/**
 * Stock Analysis —— 股票行情 + 指标分析（server-only）。
 * 走统一缓存（行情 5min / 历史 1day），Provider 故障时优雅降级。
 */

import "server-only";

import { MARKET_TTL, withMarketCache } from "@/market/cache";
import { computeIndicators } from "@/market/indicators";
import { getMarketProvider } from "@/market/providers";
import type { HistoryPoint, Quote, SecurityAnalysis } from "@/market/types";

/** 获取股票实时报价（带缓存） */
export async function getStockQuote(code: string): Promise<Quote | null> {
  const provider = getMarketProvider();
  const { value } = await withMarketCache(`stock:quote:${provider.id}:${code}`, MARKET_TTL.quote, () =>
    provider.getStockQuote(code),
  );
  return value;
}

/** 获取股票历史价格（带缓存） */
export async function getStockHistory(code: string, days = 90): Promise<HistoryPoint[]> {
  const provider = getMarketProvider();
  const { value } = await withMarketCache(
    `stock:history:${provider.id}:${code}:${days}`,
    MARKET_TTL.history,
    () => provider.getStockHistory(code, days),
  );
  return value ?? [];
}

/** 单只股票完整分析：报价 + 历史 + 量化指标 */
export async function analyzeStock(code: string, days = 90): Promise<SecurityAnalysis> {
  const provider = getMarketProvider();
  const [quoteRes, historyRes] = await Promise.all([
    withMarketCache(`stock:quote:${provider.id}:${code}`, MARKET_TTL.quote, () =>
      provider.getStockQuote(code),
    ),
    withMarketCache(`stock:history:${provider.id}:${code}:${days}`, MARKET_TTL.history, () =>
      provider.getStockHistory(code, days),
    ),
  ]);
  const quote = quoteRes.value;
  const history = historyRes.value ?? [];
  return {
    code,
    name: quote?.name ?? code,
    type: "stock",
    quote,
    history,
    indicators: computeIndicators(history),
    source: quoteRes.source,
    simulated: quote?.simulated ?? provider.simulated,
  };
}
