import "server-only";

/**
 * MarketService（Phase 6.9 需求一 / 八 / 十三 / 十四）。
 * 职责：
 *  - 按能力路由到用户配置的 Provider（默认源优先，逐个尝试）。
 *  - 成功 → 写缓存返回 live；全部失败 → 读缓存返回 cached + 明确提示（验收测试 5）。
 *  - 无数据源 / 无缓存 → none + 可行动引导（绝不伪造行情，需求十四）。
 *  - 全程零 LLM：行情获取与趋势判断均为纯代码（需求十三）。
 */

import type {
  FundNAV,
  MarketIndexQuote,
  MarketOverview,
  MarketTrend,
  StockQuote,
} from "../types";
import { resolveProvidersFor } from "../providers";
import { readFinanceCache, saveQuotesToCache } from "./cache";

export const NO_SOURCE_NOTICE =
  "尚未配置金融数据源，无法获取真实行情。请前往「设置 → 金融数据源」添加数据源。";
export const STALE_NOTICE_PREFIX = "数据源暂时不可用，当前展示缓存行情";

export interface QuoteFetchResult {
  quotes: StockQuote[];
  navs: FundNAV[];
  /** live=实时；cached=数据源失败降级缓存；none=无数据源且无缓存 */
  dataStatus: "live" | "cached" | "partial" | "none";
  dataNotice?: string;
  sourceName?: string;
  errors: string[];
}

/**
 * 获取用户持仓所需行情（股票 + 基金），带缓存降级。
 */
export async function fetchQuotesForUser(
  userId: string,
  symbols: string[],
  fundCodes: string[],
): Promise<QuoteFetchResult> {
  const errors: string[] = [];
  let sourceName: string | undefined;

  // ── 股票行情 ──
  let quotes: StockQuote[] = [];
  let stockLive = symbols.length === 0;
  if (symbols.length > 0) {
    const providers = await resolveProvidersFor(userId, "stock");
    for (const { provider } of providers) {
      try {
        quotes = await provider.getStockPrice(symbols);
        sourceName = provider.label;
        stockLive = true;
        break;
      } catch (e) {
        errors.push(`${provider.label}: ${(e as Error).message}`);
      }
    }
  }

  // ── 基金净值 ──
  let navs: FundNAV[] = [];
  let fundLive = fundCodes.length === 0;
  if (fundCodes.length > 0) {
    const providers = await resolveProvidersFor(userId, "fund");
    for (const { provider } of providers) {
      try {
        navs = await provider.getFundNAV(fundCodes);
        sourceName = sourceName ?? provider.label;
        fundLive = true;
        break;
      } catch (e) {
        errors.push(`${provider.label}: ${(e as Error).message}`);
      }
    }
  }

  // 成功部分写入缓存
  if (quotes.length > 0 || navs.length > 0) {
    saveQuotesToCache(userId, { quotes, navs });
  }

  // 失败部分从缓存补齐（验收测试 5：数据源失败 → 缓存 + 提示）
  const cache = readFinanceCache(userId);
  let usedCache = false;
  if (!stockLive && symbols.length > 0) {
    const cached = symbols
      .map((s) => cache.quotes[s])
      .filter((q): q is StockQuote => Boolean(q));
    if (cached.length > 0) {
      quotes = cached;
      usedCache = true;
    }
  }
  if (!fundLive && fundCodes.length > 0) {
    const cached = fundCodes
      .map((c) => cache.navs[c])
      .filter((n): n is FundNAV => Boolean(n));
    if (cached.length > 0) {
      navs = cached;
      usedCache = true;
    }
  }

  const wanted = symbols.length + fundCodes.length;
  const got = quotes.length + navs.length;
  const allLive = stockLive && fundLive;

  let dataStatus: QuoteFetchResult["dataStatus"];
  let dataNotice: string | undefined;

  const anySourceTried = (await resolveProvidersFor(userId, "stock")).length > 0 ||
    (await resolveProvidersFor(userId, "fund")).length > 0;

  if (wanted === 0) {
    dataStatus = "none";
  } else if (allLive) {
    dataStatus = got >= wanted ? "live" : "partial";
    if (dataStatus === "partial") {
      dataNotice = "部分标的未获取到行情（代码可能有误或数据源不覆盖）。";
    }
  } else if (usedCache) {
    dataStatus = "cached";
    const at = cache.updatedAt ? new Date(cache.updatedAt).toLocaleString("zh-CN") : "较早时间";
    dataNotice = `${STALE_NOTICE_PREFIX}（更新于 ${at}），请稍后重试或检查数据源配置。`;
  } else if (!anySourceTried) {
    dataStatus = "none";
    dataNotice = NO_SOURCE_NOTICE;
  } else {
    dataStatus = "none";
    dataNotice = `数据源暂时不可用且无缓存可用：${errors[0] ?? "未知错误"}`;
  }

  return { quotes, navs, dataStatus, dataNotice, sourceName, errors };
}

/** 纯代码市场趋势判断（需求八 / 十三：不调 LLM） */
function classifyTrend(indices: MarketIndexQuote[]): { trend: MarketTrend; note: string } {
  const pcts = indices
    .map((i) => i.changePct)
    .filter((p): p is number => typeof p === "number" && Number.isFinite(p));
  if (pcts.length === 0) return { trend: "unknown", note: "指数涨跌数据不足，暂无法判断市场趋势。" };
  const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
  if (avg >= 1) return { trend: "up", note: `主要指数平均上涨 ${avg.toFixed(2)}%，市场情绪偏暖；注意波动风险，避免追高。` };
  if (avg <= -1) return { trend: "down", note: `主要指数平均下跌 ${Math.abs(avg).toFixed(2)}%，市场调整中；关注持仓风险暴露与仓位集中度。` };
  return { trend: "sideways", note: `主要指数涨跌幅在 ±1% 以内（平均 ${avg.toFixed(2)}%），市场震荡整理。` };
}

/**
 * 市场环境概览（指数 + 趋势），带缓存降级。
 */
export async function getMarketOverview(userId: string): Promise<MarketOverview> {
  const providers = await resolveProvidersFor(userId, "index");
  let indices: MarketIndexQuote[] = [];
  let dataStatus: MarketOverview["dataStatus"] = "none";
  let dataNotice: string | undefined;
  const errors: string[] = [];

  for (const { provider } of providers) {
    try {
      indices = await provider.getMarketIndex();
      dataStatus = "live";
      break;
    } catch (e) {
      errors.push(`${provider.label}: ${(e as Error).message}`);
    }
  }

  if (dataStatus === "live" && indices.length > 0) {
    saveQuotesToCache(userId, { indices });
  } else {
    const cache = readFinanceCache(userId);
    const cached = Object.values(cache.indices);
    if (cached.length > 0) {
      indices = cached;
      dataStatus = "cached";
      const at = cache.updatedAt ? new Date(cache.updatedAt).toLocaleString("zh-CN") : "较早时间";
      dataNotice = `${STALE_NOTICE_PREFIX}（更新于 ${at}）。`;
    } else if (providers.length === 0) {
      dataNotice = NO_SOURCE_NOTICE;
    } else {
      dataNotice = `指数数据源暂时不可用：${errors[0] ?? "未知错误"}`;
    }
  }

  const { trend, note } = classifyTrend(indices);
  return {
    indices,
    trend,
    trendNote: indices.length > 0 ? note : "暂无指数数据，无法分析市场趋势。",
    dataStatus,
    dataNotice,
    updatedAt: new Date().toISOString(),
  };
}
