import "server-only";

/**
 * 腾讯行情 Adapter（公开接口，免 API Key）。
 * 真实市场数据来源：qt.gtimg.cn（实时报价 / 指数）+ web.ifzq.gtimg.cn（历史K线）。
 * 仅做数据获取与归一化，不做任何模拟兜底 —— 失败即抛错，由 MarketService 决定缓存降级。
 */

import type {
  FundNAV,
  HistoricalSeries,
  MarketDataProvider,
  MarketIndexQuote,
  ProviderCapabilities,
  StockQuote,
} from "../types";

const DEFAULT_BASE = "https://qt.gtimg.cn";
const KLINE_BASE = "https://web.ifzq.gtimg.cn";
const TIMEOUT_MS = 8000;

/** 核心指数缺省集合 */
export const CORE_INDICES = [
  { code: "sh000001", name: "上证指数" },
  { code: "sz399001", name: "深证成指" },
  { code: "sz399006", name: "创业板指" },
];

/** 归一化股票代码：600519 → sh600519；000001 → sz000001；已带前缀原样 */
export function normalizeSymbol(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (/^(sh|sz|bj|hk|us)/.test(s)) return s;
  if (/^6\d{5}$/.test(s)) return `sh${s}`;
  if (/^(0|3)\d{5}$/.test(s)) return `sz${s}`;
  if (/^(4|8)\d{5}$/.test(s)) return `bj${s}`;
  if (/^\d{5}$/.test(s)) return `hk${s.padStart(5, "0")}`;
  if (/^[a-z.]+$/.test(s)) return `us${s.toUpperCase()}`;
  return s;
}

async function fetchGbkText(url: string): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Referer: "https://gu.qq.com/" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`行情接口响应 ${res.status}`);
  const buf = await res.arrayBuffer();
  try {
    return new TextDecoder("gbk").decode(buf);
  } catch {
    return new TextDecoder("utf-8").decode(buf);
  }
}

function num(v: string | undefined): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** 解析 v_sh600519="1~贵州茅台~600519~价格~昨收~今开~...~涨跌~涨跌%~..." */
function parseQuoteLine(line: string, sourceLabel: string): StockQuote | null {
  const m = line.match(/v_([a-z]{2}[A-Za-z0-9.]+)="([^"]*)"/);
  if (!m) return null;
  const symbol = m[1];
  const f = m[2].split("~");
  if (f.length < 6) return null;
  const price = num(f[3]);
  const prevClose = num(f[4]);
  if (price == null || price <= 0) return null;
  const change = num(f[31]) ?? (prevClose != null ? Math.round((price - prevClose) * 100) / 100 : undefined);
  const changePct =
    num(f[32]) ??
    (prevClose && prevClose > 0
      ? Math.round(((price - prevClose) / prevClose) * 10000) / 100
      : undefined);
  const currency = symbol.startsWith("hk") ? "HKD" : symbol.startsWith("us") ? "USD" : "CNY";
  return {
    symbol,
    name: f[1] || symbol,
    price,
    prevClose,
    change,
    changePct,
    currency,
    timestamp: new Date().toISOString(),
    source: sourceLabel,
  };
}

export class TencentQuoteProvider implements MarketDataProvider {
  readonly kind = "tencent-quote" as const;
  readonly capabilities: ProviderCapabilities = {
    stock: true,
    fund: false,
    index: true,
    history: true,
    news: false,
  };

  constructor(
    readonly label: string = "腾讯行情",
    private baseUrl: string = DEFAULT_BASE,
  ) {
    this.baseUrl = (baseUrl || DEFAULT_BASE).replace(/\/+$/, "");
  }

  async getStockPrice(symbols: string[]): Promise<StockQuote[]> {
    if (symbols.length === 0) return [];
    const normalized = symbols.map(normalizeSymbol);
    const text = await fetchGbkText(`${this.baseUrl}/q=${normalized.join(",")}`);
    const quotes: StockQuote[] = [];
    for (const line of text.split(";")) {
      const q = parseQuoteLine(line, this.label);
      if (q) quotes.push(q);
    }
    if (quotes.length === 0) throw new Error("行情接口未返回有效报价");
    return quotes;
  }

  async getFundNAV(): Promise<FundNAV[]> {
    throw new Error("腾讯行情源不支持基金净值，请配置基金数据源");
  }

  async getMarketIndex(codes?: string[]): Promise<MarketIndexQuote[]> {
    const list = codes && codes.length > 0 ? codes : CORE_INDICES.map((i) => i.code);
    const quotes = await this.getStockPrice(list);
    return quotes.map((q) => ({
      code: q.symbol,
      name: q.name,
      value: q.price,
      change: q.change,
      changePct: q.changePct,
      timestamp: q.timestamp,
      source: q.source,
    }));
  }

  async getHistoricalData(symbol: string, days = 60): Promise<HistoricalSeries> {
    const sym = normalizeSymbol(symbol);
    const n = Math.min(Math.max(days, 5), 320);
    const url = `${KLINE_BASE}/appstock/app/fqkline/get?param=${sym},day,,,${n},qfq`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`历史行情接口响应 ${res.status}`);
    const json = (await res.json()) as {
      data?: Record<string, { qfqday?: string[][]; day?: string[][] }>;
    };
    const bucket = json.data?.[sym];
    const rows = bucket?.qfqday ?? bucket?.day ?? [];
    const points = rows
      .map((r) => ({ date: String(r[0]), close: Number(r[2]) }))
      .filter((p) => Number.isFinite(p.close) && p.close > 0);
    if (points.length === 0) throw new Error("历史行情为空");
    return { symbol: sym, points, source: this.label };
  }
}
