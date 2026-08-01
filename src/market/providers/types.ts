/**
 * MarketDataProvider —— 市场数据统一接口（Phase 6.4 第二项）。
 * 不绑定单一数据源：Mock / 真实行情 API 实现同一接口，注册表切换。
 * 纯类型定义，客户端 / 服务端共享。
 */

import type { ExchangeRate, HistoryPoint, IndexQuote, Quote } from "@/market/types";

export interface MarketDataProvider {
  /** Provider 标识（mock-market / tushare / eastmoney ...） */
  readonly id: string;
  /** 是否为模拟数据源 */
  readonly simulated: boolean;

  /* ------ 股票 ------ */
  getStockQuote(code: string): Promise<Quote | null>;
  getStockQuotes(codes: string[]): Promise<Quote[]>;
  getStockHistory(code: string, days: number): Promise<HistoryPoint[]>;

  /* ------ 基金 ------ */
  getFundNAV(code: string): Promise<Quote | null>;
  getFundNAVs(codes: string[]): Promise<Quote[]>;
  getFundHistory(code: string, days: number): Promise<HistoryPoint[]>;

  /* ------ 指数 ------ */
  getIndex(code: string): Promise<IndexQuote | null>;
  getIndices(codes: string[]): Promise<IndexQuote[]>;

  /* ------ 汇率 ------ */
  getExchangeRate(pair: string): Promise<ExchangeRate | null>;

  /** 健康检查（真实 API 探活；Mock 恒为 true） */
  ping(): Promise<boolean>;
}
