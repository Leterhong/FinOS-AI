import "server-only";

/**
 * Provider 工厂与能力路由（Phase 6.9 需求一 / 二）。
 * MarketService 通过 resolveProvidersFor(userId, capability) 获取按能力匹配的
 * Provider 实例列表（默认源优先），完全不绑定单一数据源。
 */

import type { MarketDataProvider, NewsProvider, ProviderCapabilities } from "../types";
import { financeSourceStore, type FinanceSourceConfig } from "./store";
import { TencentQuoteProvider } from "./tencent";
import { EastmoneyFundProvider } from "./eastmoney";
import { CustomHttpProvider } from "./custom";

export { financeSourceStore } from "./store";
export type { FinanceSourceConfig } from "./store";
export { FINANCE_PROVIDER_PRESETS, getFinancePreset } from "./presets";
export { normalizeSymbol, CORE_INDICES } from "./tencent";

/** 根据用户配置创建 Provider 实例（明文 Key 仅存在于内存） */
export function createProvider(
  config: FinanceSourceConfig,
): (MarketDataProvider & Partial<NewsProvider>) | null {
  try {
    switch (config.kind) {
      case "tencent-quote":
        return new TencentQuoteProvider(config.name, config.baseUrl);
      case "eastmoney-fund":
        return new EastmoneyFundProvider(config.name, config.baseUrl);
      case "custom": {
        if (!config.baseUrl) return null;
        const key = financeSourceStore.decryptKey(config);
        return new CustomHttpProvider(config.name, config.baseUrl, key);
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export interface ResolvedProvider {
  provider: MarketDataProvider & Partial<NewsProvider>;
  config: FinanceSourceConfig;
}

/**
 * 解析用户的全部数据源，按能力过滤并排序（默认源优先，其余按创建时间）。
 * 用户未配置任何数据源 → 返回空数组（上层给出可行动提示，绝不伪造行情）。
 */
export async function resolveProvidersFor(
  userId: string,
  capability: keyof ProviderCapabilities,
): Promise<ResolvedProvider[]> {
  const configs = await financeSourceStore.listRaw(userId);
  const resolved: ResolvedProvider[] = [];
  for (const config of configs) {
    const provider = createProvider(config);
    if (provider && provider.capabilities[capability]) {
      resolved.push({ provider, config });
    }
  }
  resolved.sort((a, b) => Number(b.config.isDefault) - Number(a.config.isDefault));
  return resolved;
}

/** 用户是否配置了任何数据源 */
export async function hasAnySource(userId: string): Promise<boolean> {
  return (await financeSourceStore.listRaw(userId)).length > 0;
}
