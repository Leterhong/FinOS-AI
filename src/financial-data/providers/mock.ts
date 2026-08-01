/**
 * Mock Providers —— 模拟行情数据源（确定性伪随机，同一代码同一天报价稳定）。
 * 所有输出 simulated=true，UI / AI 必须明确标注「模拟行情，非真实市场数据」。
 */

import type {
  FundProvider,
  HistoryPoint,
  ProviderPosition,
  Quote,
  StockProvider,
} from "./types";

/** 模拟数据声明（供 UI / Prompt 引用） */
export const SIMULATED_QUOTE_NOTE = "模拟行情数据，非真实市场报价";

/* ------------------------- 确定性伪随机工具 ------------------------- */

/** 字符串 → 稳定 hash（FNV-1a） */
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 稳定 [0,1) 伪随机（同 seed 同结果） */
function rand01(seed: string): number {
  return (hash(seed) % 100000) / 100000;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 基于代码生成稳定基准价 */
function basePrice(code: string, min: number, max: number): number {
  return round2(min + rand01(`base-${code}`) * (max - min));
}

/** 生成当日报价（带小幅日内波动） */
function mockQuote(
  code: string,
  opts: { name: string; min: number; max: number; provider: string },
): Quote {
  const base = basePrice(code, opts.min, opts.max);
  // 当日涨跌幅 -3% ~ +3%，以 code+date 为种子保证当天稳定
  const changeRate = round2((rand01(`chg-${code}-${today()}`) * 6 - 3)) / 100;
  return {
    code,
    name: opts.name,
    price: round2(base * (1 + changeRate)),
    changeRate,
    currency: "CNY",
    quotedAt: new Date().toISOString(),
    provider: opts.provider,
    simulated: true,
  };
}

/** 生成历史价格序列（随机游走，向 base 回归） */
function mockHistory(code: string, days: number, min: number, max: number): HistoryPoint[] {
  const base = basePrice(code, min, max);
  const points: HistoryPoint[] = [];
  let price = base * (0.9 + rand01(`h0-${code}`) * 0.2);
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const date = d.toISOString().slice(0, 10);
    const drift = (base - price) * 0.02; // 均值回归
    const noise = (rand01(`hn-${code}-${date}`) - 0.5) * base * 0.03;
    price = Math.max(base * 0.5, price + drift + noise);
    points.push({ date, price: round2(price) });
  }
  return points;
}

/** 常见 A 股名称表（未命中则生成通用名） */
const STOCK_NAMES: Record<string, string> = {
  "600519": "贵州茅台",
  "000001": "平安银行",
  "600036": "招商银行",
  "000858": "五粮液",
  "601318": "中国平安",
  "300750": "宁德时代",
  "002594": "比亚迪",
  "601899": "紫金矿业",
};

const FUND_NAMES: Record<string, string> = {
  "110011": "易方达中小盘混合",
  "005827": "易方达蓝筹精选混合",
  "000961": "天弘沪深300ETF联接",
  "161725": "招商中证白酒指数",
  "519674": "银河创新成长混合",
  "003096": "中欧医疗健康混合",
};

/* ------------------------------ Mock 股票 ------------------------------ */

export class MockStockProvider implements StockProvider {
  readonly id = "mock-stock";
  readonly simulated = true;

  async getQuote(code: string): Promise<Quote | null> {
    if (!code.trim()) return null;
    const name = STOCK_NAMES[code] ?? `模拟股票${code}`;
    return mockQuote(code, { name, min: 8, max: 1800, provider: this.id });
  }

  async getQuotes(codes: string[]): Promise<Quote[]> {
    const out: Quote[] = [];
    for (const code of codes) {
      const q = await this.getQuote(code);
      if (q) out.push(q);
    }
    return out;
  }

  async getHistory(code: string, days: number): Promise<HistoryPoint[]> {
    return mockHistory(code, Math.min(Math.max(days, 1), 365), 8, 1800);
  }

  async getPortfolio(): Promise<ProviderPosition[] | null> {
    // Mock 数据源不提供账户组合（真实券商 API 才有）
    return null;
  }
}

/* ------------------------------ Mock 基金 ------------------------------ */

export class MockFundProvider implements FundProvider {
  readonly id = "mock-fund";
  readonly simulated = true;

  async getQuote(code: string): Promise<Quote | null> {
    if (!code.trim()) return null;
    const name = FUND_NAMES[code] ?? `模拟基金${code}`;
    return mockQuote(code, { name, min: 0.8, max: 6, provider: this.id });
  }

  async getQuotes(codes: string[]): Promise<Quote[]> {
    const out: Quote[] = [];
    for (const code of codes) {
      const q = await this.getQuote(code);
      if (q) out.push(q);
    }
    return out;
  }

  async getHistory(code: string, days: number): Promise<HistoryPoint[]> {
    return mockHistory(code, Math.min(Math.max(days, 1), 365), 0.8, 6);
  }

  async getEstimate(code: string): Promise<Quote | null> {
    // 盘中估值 = 当日报价加微小偏移
    const q = await this.getQuote(code);
    if (!q) return null;
    const offset = (rand01(`est-${code}-${today()}`) - 0.5) * 0.01;
    return { ...q, price: round2(q.price * (1 + offset)) };
  }
}
