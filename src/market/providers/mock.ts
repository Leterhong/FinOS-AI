/**
 * MockMarketProvider —— 模拟市场数据源。
 * 股票 / 基金复用 financial-data/providers 的 Mock Provider（不重复造轮子），
 * 指数 / 汇率用同款确定性伪随机（同一代码同一天报价稳定）。
 * 所有输出 simulated=true，UI / AI 必须明确标注「模拟行情，非真实市场数据」。
 */

import { getFundProvider, getStockProvider } from "@/financial-data/providers";
import type { ExchangeRate, HistoryPoint, IndexQuote, Quote } from "@/market/types";
import type { MarketDataProvider } from "./types";

/** 模拟市场数据声明（供 UI / Prompt 引用） */
export const SIMULATED_MARKET_NOTE = "模拟行情数据，非真实市场报价";

/* ------------------------- 确定性伪随机工具（FNV-1a） ------------------------- */

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rand01(seed: string): number {
  return (hash(seed) % 100000) / 100000;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/* ------------------------------ 指数 / 汇率基准表 ------------------------------ */

/** 常见指数基准点位（未命中生成通用模拟指数） */
const INDEX_BASE: Record<string, { name: string; base: number }> = {
  sh000001: { name: "上证指数", base: 3200 },
  "000300": { name: "沪深300", base: 3900 },
  "399001": { name: "深证成指", base: 10500 },
  "399006": { name: "创业板指", base: 2100 },
  HSI: { name: "恒生指数", base: 19500 },
  SPX: { name: "标普500", base: 5600 },
  IXIC: { name: "纳斯达克综合", base: 18000 },
};

/** 常见货币对基准汇率 */
const FX_BASE: Record<string, number> = {
  "USD/CNY": 7.12,
  "HKD/CNY": 0.91,
  "EUR/CNY": 7.8,
  "JPY/CNY": 0.047,
  "GBP/CNY": 9.1,
};

/* ------------------------------ Mock 实现 ------------------------------ */

export class MockMarketProvider implements MarketDataProvider {
  readonly id = "mock-market";
  readonly simulated = true;

  private stock = getStockProvider();
  private fund = getFundProvider();

  /* ------ 股票（委托底层 Mock StockProvider） ------ */

  getStockQuote(code: string): Promise<Quote | null> {
    return this.stock.getQuote(code);
  }

  getStockQuotes(codes: string[]): Promise<Quote[]> {
    return this.stock.getQuotes(codes);
  }

  getStockHistory(code: string, days: number): Promise<HistoryPoint[]> {
    return this.stock.getHistory(code, days);
  }

  /* ------ 基金（委托底层 Mock FundProvider） ------ */

  getFundNAV(code: string): Promise<Quote | null> {
    return this.fund.getQuote(code);
  }

  getFundNAVs(codes: string[]): Promise<Quote[]> {
    return this.fund.getQuotes(codes);
  }

  getFundHistory(code: string, days: number): Promise<HistoryPoint[]> {
    return this.fund.getHistory(code, days);
  }

  /* ------ 指数 ------ */

  async getIndex(code: string): Promise<IndexQuote | null> {
    const key = code.trim();
    if (!key) return null;
    const meta = INDEX_BASE[key] ?? {
      name: `模拟指数${key}`,
      base: 1000 + rand01(`idx-base-${key}`) * 4000,
    };
    // 当日涨跌幅 -2.5% ~ +2.5%，以 code+date 为种子保证当天稳定
    const changeRate = round4((rand01(`idx-chg-${key}-${today()}`) * 5 - 2.5) / 100);
    return {
      code: key,
      name: meta.name,
      value: round2(meta.base * (1 + changeRate)),
      changeRate,
      quotedAt: new Date().toISOString(),
      provider: this.id,
      simulated: true,
    };
  }

  async getIndices(codes: string[]): Promise<IndexQuote[]> {
    const out: IndexQuote[] = [];
    for (const code of codes) {
      const q = await this.getIndex(code);
      if (q) out.push(q);
    }
    return out;
  }

  /* ------ 汇率 ------ */

  async getExchangeRate(pair: string): Promise<ExchangeRate | null> {
    const key = pair.trim().toUpperCase();
    if (!key.includes("/")) return null;
    const base = FX_BASE[key] ?? 1 + rand01(`fx-base-${key}`) * 9;
    // 汇率日波动 -0.5% ~ +0.5%
    const changeRate = round4((rand01(`fx-chg-${key}-${today()}`) - 0.5) / 100);
    return {
      pair: key,
      rate: round4(base * (1 + changeRate)),
      changeRate,
      quotedAt: new Date().toISOString(),
      provider: this.id,
      simulated: true,
    };
  }

  async ping(): Promise<boolean> {
    return true;
  }
}
