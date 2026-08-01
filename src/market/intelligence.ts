/**
 * Market Intelligence —— 市场智能编排层（server-only）。
 * getMarketSnapshot()：指数 + 汇率 + 情绪聚合 + 连接状态三色灯 + 优雅降级。
 * 任何子项失败都不抛错，最坏情况返回 EMPTY_MARKET_SNAPSHOT（灰灯）。
 */

import "server-only";

import { MARKET_TTL, withMarketCache } from "@/market/cache";
import { getMarketProvider, SIMULATED_MARKET_NOTE } from "@/market/providers";
import type {
  ExchangeRate,
  IndexQuote,
  MarketConnectionStatus,
  MarketDataSource,
  MarketSentiment,
  MarketSnapshot,
} from "@/market/types";
import { EMPTY_MARKET_SNAPSHOT } from "@/market/types";

/** 默认关注指数（A 股核心宽基） */
const DEFAULT_INDICES = ["sh000001", "000300", "399006"];
/** 默认关注汇率 */
const DEFAULT_FX_PAIRS = ["USD/CNY"];

/** 由子项数据来源聚合连接状态 */
function aggregateStatus(sources: MarketDataSource[]): MarketConnectionStatus {
  const usable = sources.filter((s) => s !== "none");
  if (usable.length === 0) return "unavailable";
  if (usable.some((s) => s === "stale")) return "cached";
  return "connected";
}

/** 由指数涨跌聚合市场情绪 */
function aggregateSentiment(indices: IndexQuote[]): MarketSentiment {
  if (indices.length === 0) return "unknown";
  const up = indices.filter((i) => i.changeRate > 0.001).length;
  const down = indices.filter((i) => i.changeRate < -0.001).length;
  if (up > 0 && down === 0) return "up";
  if (down > 0 && up === 0) return "down";
  return "mixed";
}

function pct(rate: number): string {
  const v = rate * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

/** 生成一句话市场概览（模拟数据强制带标注） */
function buildSummary(
  indices: IndexQuote[],
  sentiment: MarketSentiment,
  simulated: boolean,
): string {
  if (indices.length === 0) return "等待连接市场数据源";
  const parts = indices.slice(0, 3).map((i) => `${i.name} ${pct(i.changeRate)}`);
  const tone =
    sentiment === "up"
      ? "市场整体上行"
      : sentiment === "down"
        ? "市场整体回调"
        : "市场涨跌分化";
  const body = `${tone}：${parts.join("，")}`;
  return simulated ? `【${SIMULATED_MARKET_NOTE}】${body}` : body;
}

/**
 * 获取市场快照（Dashboard 投资中心 / AI CFO marketData 注入的统一入口）。
 * @param indexCodes 关注指数（默认 A 股核心宽基）
 * @param fxPairs 关注货币对（默认 USD/CNY）
 */
export async function getMarketSnapshot(
  indexCodes: string[] = DEFAULT_INDICES,
  fxPairs: string[] = DEFAULT_FX_PAIRS,
): Promise<MarketSnapshot> {
  try {
    const provider = getMarketProvider();

    const indexResults = await Promise.all(
      indexCodes.map((code) =>
        withMarketCache(`index:${provider.id}:${code}`, MARKET_TTL.index, () =>
          provider.getIndex(code),
        ),
      ),
    );
    const fxResults = await Promise.all(
      fxPairs.map((pair) =>
        withMarketCache(`fx:${provider.id}:${pair}`, MARKET_TTL.fx, () =>
          provider.getExchangeRate(pair),
        ),
      ),
    );

    const indices = indexResults
      .map((r) => r.value)
      .filter((v): v is IndexQuote => v !== null);
    const rates = fxResults
      .map((r) => r.value)
      .filter((v): v is ExchangeRate => v !== null);

    const sources = [...indexResults, ...fxResults].map((r) => r.source);
    const status = aggregateStatus(sources);

    if (status === "unavailable" || indices.length === 0) {
      return { ...EMPTY_MARKET_SNAPSHOT, generatedAt: new Date().toISOString() };
    }

    const simulated =
      indices.some((i) => i.simulated) || rates.some((r) => r.simulated);
    const sentiment = aggregateSentiment(indices);

    return {
      status,
      provider: provider.id,
      simulated,
      generatedAt: new Date().toISOString(),
      indices,
      rates,
      sentiment,
      summary: buildSummary(indices, sentiment, simulated),
    };
  } catch {
    // 最坏情况：优雅降级为灰灯空快照，绝不抛错、绝不展示虚假行情
    return { ...EMPTY_MARKET_SNAPSHOT, generatedAt: new Date().toISOString() };
  }
}
