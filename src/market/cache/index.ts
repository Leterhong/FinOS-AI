/**
 * Market Cache —— 市场数据 TTL 缓存（Phase 6.4 第十项，server-only）。
 * TTL：行情 5 分钟 / 历史数据 1 天 / 指数 5 分钟 / 汇率 1 小时。
 *
 * 兜底策略（支撑市场连接状态三色灯）：
 * - TTL 内缓存命中 → source="cache"（视为正常连接）
 * - 缓存未命中 → 实时拉取成功 → source="fresh"
 * - 拉取失败但存在过期缓存 → source="stale"（黄灯 Using Cached Data）
 * - 拉取失败且无任何缓存 → source="none"（灰灯 No Market Data）
 */

import "server-only";

import type { MarketDataSource } from "@/market/types";

/** TTL 常量（毫秒） */
export const MARKET_TTL = {
  /** 股票 / 基金行情：5 分钟 */
  quote: 5 * 60 * 1000,
  /** 历史数据：1 天 */
  history: 24 * 60 * 60 * 1000,
  /** 指数：5 分钟 */
  index: 5 * 60 * 1000,
  /** 汇率：1 小时 */
  fx: 60 * 60 * 1000,
} as const;

interface CacheEntry {
  value: unknown;
  storedAt: number;
  expiresAt: number;
}

/** 进程级内存缓存（dev 热重载间通过 globalThis 复用） */
const globalStore = globalThis as unknown as { __finosMarketCache?: Map<string, CacheEntry> };
const store: Map<string, CacheEntry> = globalStore.__finosMarketCache ?? new Map();
globalStore.__finosMarketCache = store;

/** 缓存条目上限（简单 LRU 淘汰：超限时删最旧） */
const MAX_ENTRIES = 2000;

function setEntry(key: string, value: unknown, ttlMs: number): void {
  if (store.size >= MAX_ENTRIES) {
    let oldestKey: string | null = null;
    let oldestAt = Infinity;
    for (const [k, v] of store) {
      if (v.storedAt < oldestAt) {
        oldestAt = v.storedAt;
        oldestKey = k;
      }
    }
    if (oldestKey) store.delete(oldestKey);
  }
  const now = Date.now();
  store.set(key, { value, storedAt: now, expiresAt: now + ttlMs });
}

/** 带来源标记的缓存读取结果 */
export interface CachedResult<T> {
  value: T | null;
  source: MarketDataSource;
  /** 数据落库时间（缓存命中时有值） */
  storedAt?: string;
}

/**
 * 统一缓存包装：TTL 内直接返回缓存；否则拉取并写缓存；
 * 拉取失败时用过期缓存兜底（stale），彻底失败返回 none。
 * fetcher 返回 null 视为「无数据」，不写缓存。
 */
export async function withMarketCache<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T | null>,
): Promise<CachedResult<T>> {
  const now = Date.now();
  const entry = store.get(key);

  if (entry && entry.expiresAt > now) {
    return {
      value: entry.value as T,
      source: "cache",
      storedAt: new Date(entry.storedAt).toISOString(),
    };
  }

  try {
    const fresh = await fetcher();
    if (fresh !== null && fresh !== undefined) {
      setEntry(key, fresh, ttlMs);
      return { value: fresh, source: "fresh" };
    }
  } catch {
    // 拉取失败 → 走 stale 兜底
  }

  if (entry) {
    return {
      value: entry.value as T,
      source: "stale",
      storedAt: new Date(entry.storedAt).toISOString(),
    };
  }
  return { value: null, source: "none" };
}

/** 清空缓存（测试用） */
export function clearMarketCache(): void {
  store.clear();
}

/** 当前缓存条目数（诊断用） */
export function marketCacheSize(): number {
  return store.size;
}
