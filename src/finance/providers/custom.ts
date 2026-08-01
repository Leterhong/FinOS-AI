import "server-only";

/**
 * 自定义 HTTP JSON 数据源 Adapter（Phase 6.9 需求三核心）。
 * 用户配置：API 地址 + API Key + 来源名称（仿模型 API 配置）。
 *
 * REST 契约（宽容解析，兼容数组根节点）：
 *   GET {base}/stock?symbols=a,b   → { quotes:  [{ symbol,name,price,prevClose?,change?,changePct?,currency?,timestamp? }] }
 *   GET {base}/fund?codes=a,b      → { navs:    [{ code,name,nav,navDate?,changePct? }] }
 *   GET {base}/index?codes=a,b     → { indices: [{ code,name,value,change?,changePct? }] }
 *   GET {base}/history?symbol=&days= → { symbol, points: [{ date, close }] }
 *   GET {base}/news?symbols=&limit=  → { items:  [{ id?,title,summary?,source?,url?,publishedAt?,symbols?,importance? }] }
 * 鉴权：Authorization: Bearer <API Key> + X-API-Key。
 */

import type {
  FinanceNewsItem,
  FundNAV,
  HistoricalSeries,
  MarketDataProvider,
  MarketIndexQuote,
  NewsProvider,
  ProviderCapabilities,
  StockQuote,
} from "../types";

const TIMEOUT_MS = 8000;

function toNum(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function pickArray(json: unknown, keys: string[]): Record<string, unknown>[] {
  if (Array.isArray(json)) return json as Record<string, unknown>[];
  if (json && typeof json === "object") {
    for (const k of keys) {
      const v = (json as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
    }
  }
  return [];
}

export class CustomHttpProvider implements MarketDataProvider, NewsProvider {
  readonly kind = "custom" as const;
  readonly capabilities: ProviderCapabilities = {
    stock: true,
    fund: true,
    index: true,
    history: true,
    news: true,
  };

  constructor(
    readonly label: string,
    private baseUrl: string,
    private apiKey: string = "",
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    if (!this.baseUrl) throw new Error("自定义数据源缺少 API 地址");
  }

  private async get(pathAndQuery: string): Promise<unknown> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
      headers["X-API-Key"] = this.apiKey;
    }
    const res = await fetch(`${this.baseUrl}${pathAndQuery}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`数据源响应 ${res.status}`);
    return res.json();
  }

  async getStockPrice(symbols: string[]): Promise<StockQuote[]> {
    if (symbols.length === 0) return [];
    const json = await this.get(`/stock?symbols=${encodeURIComponent(symbols.join(","))}`);
    const rows = pickArray(json, ["quotes", "data", "stocks"]);
    const quotes: StockQuote[] = [];
    for (const r of rows) {
      const symbol = String(r.symbol ?? r.code ?? "").trim();
      const price = toNum(r.price ?? r.current ?? r.close);
      if (!symbol || price == null || price <= 0) continue;
      const prevClose = toNum(r.prevClose ?? r.prev_close);
      quotes.push({
        symbol,
        name: String(r.name ?? symbol),
        price,
        prevClose,
        change: toNum(r.change) ?? (prevClose != null ? Math.round((price - prevClose) * 100) / 100 : undefined),
        changePct:
          toNum(r.changePct ?? r.change_pct ?? r.pct) ??
          (prevClose && prevClose > 0
            ? Math.round(((price - prevClose) / prevClose) * 10000) / 100
            : undefined),
        currency: typeof r.currency === "string" ? r.currency : "CNY",
        timestamp: typeof r.timestamp === "string" ? r.timestamp : new Date().toISOString(),
        source: this.label,
      });
    }
    if (quotes.length === 0) throw new Error("数据源未返回有效股票报价");
    return quotes;
  }

  async getFundNAV(codes: string[]): Promise<FundNAV[]> {
    if (codes.length === 0) return [];
    const json = await this.get(`/fund?codes=${encodeURIComponent(codes.join(","))}`);
    const rows = pickArray(json, ["navs", "data", "funds"]);
    const navs: FundNAV[] = [];
    for (const r of rows) {
      const code = String(r.code ?? r.fundcode ?? "").trim();
      const nav = toNum(r.nav ?? r.dwjz ?? r.value);
      if (!code || nav == null || nav <= 0) continue;
      navs.push({
        code,
        name: String(r.name ?? code),
        nav,
        navDate: typeof r.navDate === "string" ? r.navDate : undefined,
        changePct: toNum(r.changePct ?? r.change_pct),
        timestamp: typeof r.timestamp === "string" ? r.timestamp : new Date().toISOString(),
        source: this.label,
      });
    }
    if (navs.length === 0) throw new Error("数据源未返回有效基金净值");
    return navs;
  }

  async getMarketIndex(codes?: string[]): Promise<MarketIndexQuote[]> {
    const q = codes && codes.length > 0 ? `?codes=${encodeURIComponent(codes.join(","))}` : "";
    const json = await this.get(`/index${q}`);
    const rows = pickArray(json, ["indices", "data", "indexes"]);
    const indices: MarketIndexQuote[] = [];
    for (const r of rows) {
      const code = String(r.code ?? r.symbol ?? "").trim();
      const value = toNum(r.value ?? r.price ?? r.current);
      if (!code || value == null || value <= 0) continue;
      indices.push({
        code,
        name: String(r.name ?? code),
        value,
        change: toNum(r.change),
        changePct: toNum(r.changePct ?? r.change_pct),
        timestamp: typeof r.timestamp === "string" ? r.timestamp : new Date().toISOString(),
        source: this.label,
      });
    }
    if (indices.length === 0) throw new Error("数据源未返回有效指数");
    return indices;
  }

  async getHistoricalData(symbol: string, days = 60): Promise<HistoricalSeries> {
    const json = await this.get(
      `/history?symbol=${encodeURIComponent(symbol)}&days=${Math.min(Math.max(days, 5), 500)}`,
    );
    const rows = pickArray(json, ["points", "data", "history"]);
    const points = rows
      .map((r) => ({
        date: String(r.date ?? ""),
        close: toNum(r.close ?? r.price ?? r.value) ?? 0,
      }))
      .filter((p) => p.date && p.close > 0);
    if (points.length === 0) throw new Error("数据源未返回有效历史数据");
    return { symbol, points, source: this.label };
  }

  async getNews(opts?: { symbols?: string[]; limit?: number }): Promise<FinanceNewsItem[]> {
    const params = new URLSearchParams();
    if (opts?.symbols?.length) params.set("symbols", opts.symbols.join(","));
    if (opts?.limit) params.set("limit", String(opts.limit));
    const qs = params.toString();
    const json = await this.get(`/news${qs ? `?${qs}` : ""}`);
    const rows = pickArray(json, ["items", "data", "news"]);
    return rows
      .filter((r) => typeof r.title === "string" && r.title)
      .map((r, i) => ({
        id: String(r.id ?? `news-${Date.now()}-${i}`),
        title: String(r.title),
        summary: typeof r.summary === "string" ? r.summary : undefined,
        source: typeof r.source === "string" ? r.source : this.label,
        url: typeof r.url === "string" ? r.url : undefined,
        publishedAt:
          typeof r.publishedAt === "string" ? r.publishedAt : new Date().toISOString(),
        scope:
          r.scope === "company" || r.scope === "industry" || r.scope === "market"
            ? r.scope
            : undefined,
        symbols: Array.isArray(r.symbols) ? r.symbols.map(String) : undefined,
        importance: r.importance === "major" ? "major" : "normal",
      }));
  }
}
