/**
 * Provider Registry —— 数据源注册表。
 * 通过环境变量切换实现（默认 Mock）：
 *   FINOS_STOCK_PROVIDER=mock | <future: tushare / eastmoney ...>
 *   FINOS_FUND_PROVIDER=mock | <future: eastmoney-fund ...>
 * 未来接入真实 API：实现 StockProvider / FundProvider 接口 → 在此注册即可，
 * 上层（sync / API 路由 / UI）零改动。
 */

import type { FundProvider, StockProvider } from "./types";
import { MockFundProvider, MockStockProvider } from "./mock";

export * from "./types";
export { SIMULATED_QUOTE_NOTE, MockStockProvider, MockFundProvider } from "./mock";

const stockProviders: Record<string, () => StockProvider> = {
  mock: () => new MockStockProvider(),
};

const fundProviders: Record<string, () => FundProvider> = {
  mock: () => new MockFundProvider(),
};

let stockInstance: StockProvider | null = null;
let fundInstance: FundProvider | null = null;

/** 获取当前股票数据 Provider（默认 Mock） */
export function getStockProvider(): StockProvider {
  if (!stockInstance) {
    const key = process.env.FINOS_STOCK_PROVIDER ?? "mock";
    const factory = stockProviders[key] ?? stockProviders.mock;
    stockInstance = factory();
  }
  return stockInstance;
}

/** 获取当前基金数据 Provider（默认 Mock） */
export function getFundProvider(): FundProvider {
  if (!fundInstance) {
    const key = process.env.FINOS_FUND_PROVIDER ?? "mock";
    const factory = fundProviders[key] ?? fundProviders.mock;
    fundInstance = factory();
  }
  return fundInstance;
}
