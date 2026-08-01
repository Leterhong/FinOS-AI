/**
 * Market Provider Registry —— 市场数据源注册表。
 * 环境变量切换实现（默认 Mock）：
 *   FINOS_MARKET_PROVIDER=mock | <future: tushare / eastmoney / sina ...>
 * 未来接入真实行情 API：实现 MarketDataProvider 接口 → 在此注册即可，
 * 上层（cache / intelligence / API 路由 / UI）零改动。
 */

import type { MarketDataProvider } from "./types";
import { MockMarketProvider } from "./mock";

export * from "./types";
export { MockMarketProvider, SIMULATED_MARKET_NOTE } from "./mock";

const marketProviders: Record<string, () => MarketDataProvider> = {
  mock: () => new MockMarketProvider(),
};

let instance: MarketDataProvider | null = null;

/** 获取当前市场数据 Provider（默认 Mock） */
export function getMarketProvider(): MarketDataProvider {
  if (!instance) {
    const key = process.env.FINOS_MARKET_PROVIDER ?? "mock";
    const factory = marketProviders[key] ?? marketProviders.mock;
    instance = factory();
  }
  return instance;
}
