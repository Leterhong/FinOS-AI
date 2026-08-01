import "server-only";

/**
 * 天天基金净值 Adapter（公开接口，免 API Key）。
 * 真实数据来源：fundgz.1234567.com.cn/js/{code}.js（jsonpgz 估值 + 单位净值）。
 * 失败即抛错，由 MarketService 决定缓存降级 —— 不做任何模拟兜底。
 */

import type {
  FundNAV,
  HistoricalSeries,
  MarketDataProvider,
  MarketIndexQuote,
  ProviderCapabilities,
  StockQuote,
} from "../types";

const DEFAULT_BASE = "https://fundgz.1234567.com.cn";
const TIMEOUT_MS = 8000;

interface FundGzPayload {
  fundcode?: string;
  name?: string;
  /** 单位净值（上一交易日确认） */
  dwjz?: string;
  /** 净值日期 */
  jzrq?: string;
  /** 实时估值 */
  gsz?: string;
  /** 估值涨跌幅（%） */
  gszzl?: string;
  gztime?: string;
}

export class EastmoneyFundProvider implements MarketDataProvider {
  readonly kind = "eastmoney-fund" as const;
  readonly capabilities: ProviderCapabilities = {
    stock: false,
    fund: true,
    index: false,
    history: false,
    news: false,
  };

  constructor(
    readonly label: string = "天天基金",
    private baseUrl: string = DEFAULT_BASE,
  ) {
    this.baseUrl = (baseUrl || DEFAULT_BASE).replace(/\/+$/, "");
  }

  private async fetchOne(code: string): Promise<FundNAV | null> {
    const clean = code.trim().replace(/\D/g, "");
    if (!clean) return null;
    const res = await fetch(`${this.baseUrl}/js/${clean}.js?rt=${Date.now()}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Referer: "https://fund.eastmoney.com/" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`基金净值接口响应 ${res.status}`);
    const text = await res.text();
    const m = text.match(/jsonpgz\((\{.*\})\)/);
    if (!m) return null;
    const p = JSON.parse(m[1]) as FundGzPayload;
    // 优先用实时估值 gsz，否则用确认净值 dwjz
    const nav = Number(p.gsz || p.dwjz);
    if (!Number.isFinite(nav) || nav <= 0) return null;
    const changePct = p.gszzl != null && p.gszzl !== "" ? Number(p.gszzl) : undefined;
    return {
      code: p.fundcode || clean,
      name: p.name || clean,
      nav,
      navDate: p.jzrq,
      changePct: Number.isFinite(changePct) ? changePct : undefined,
      timestamp: new Date().toISOString(),
      source: this.label,
    };
  }

  async getFundNAV(codes: string[]): Promise<FundNAV[]> {
    if (codes.length === 0) return [];
    const results = await Promise.allSettled(codes.map((c) => this.fetchOne(c)));
    const navs: FundNAV[] = [];
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) navs.push(r.value);
    }
    if (navs.length === 0) throw new Error("基金净值接口未返回有效数据");
    return navs;
  }

  async getStockPrice(): Promise<StockQuote[]> {
    throw new Error("基金净值源不支持股票行情，请配置行情数据源");
  }

  async getMarketIndex(): Promise<MarketIndexQuote[]> {
    throw new Error("基金净值源不支持指数行情");
  }

  async getHistoricalData(): Promise<HistoricalSeries> {
    throw new Error("基金净值源不支持历史行情");
  }
}
