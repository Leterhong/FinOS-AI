/**
 * Fund Analysis —— 基金净值 + 指标分析（server-only）。
 * 走统一缓存（净值 5min / 历史 1day），Provider 故障时优雅降级。
 */

import "server-only";

import { MARKET_TTL, withMarketCache } from "@/market/cache";
import { computeIndicators } from "@/market/indicators";
import { getMarketProvider } from "@/market/providers";
import type { HistoryPoint, Quote, SecurityAnalysis } from "@/market/types";

/** 获取基金净值（带缓存） */
export async function getFundNAV(code: string): Promise<Quote | null> {
  const provider = getMarketProvider();
  const { value } = await withMarketCache(`fund:nav:${provider.id}:${code}`, MARKET_TTL.quote, () =>
    provider.getFundNAV(code),
  );
  return value;
}

/** 获取基金历史净值（带缓存） */
export async function getFundHistory(code: string, days = 90): Promise<HistoryPoint[]> {
  const provider = getMarketProvider();
  const { value } = await withMarketCache(
    `fund:history:${provider.id}:${code}:${days}`,
    MARKET_TTL.history,
    () => provider.getFundHistory(code, days),
  );
  return value ?? [];
}

/** 单只基金完整分析：净值 + 历史 + 量化指标（getPerformance 能力） */
export async function analyzeFund(code: string, days = 90): Promise<SecurityAnalysis> {
  const provider = getMarketProvider();
  const [quoteRes, historyRes] = await Promise.all([
    withMarketCache(`fund:nav:${provider.id}:${code}`, MARKET_TTL.quote, () =>
      provider.getFundNAV(code),
    ),
    withMarketCache(`fund:history:${provider.id}:${code}:${days}`, MARKET_TTL.history, () =>
      provider.getFundHistory(code, days),
    ),
  ]);
  const quote = quoteRes.value;
  const history = historyRes.value ?? [];
  return {
    code,
    name: quote?.name ?? code,
    type: "fund",
    quote,
    history,
    indicators: computeIndicators(history),
    source: quoteRes.source,
    simulated: quote?.simulated ?? provider.simulated,
  };
}
