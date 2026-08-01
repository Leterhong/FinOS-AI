import "server-only";

import type { FinancialTool, ToolResult } from "./types";
import { seededValue, seededChange, SIMULATED_DATA_NOTE } from "./mock-utils";

// ── MarketDataTool（Phase 3.4）──────────────────────────────────────────────
// 能力：股票价格、历史走势、市场指标。
// 第一階段：Mock Adapter（确定性数据）。真实 API 接入点见文件底部注释。

interface Quote {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  currency: string;
  history: number[]; // 近 12 个交易日的收盘价序列（用于趋势判断）
}

const DEFAULT_WATCHLIST: { symbol: string; name: string; currency: string; base: number }[] = [
  { symbol: "HS300", name: "沪深300", currency: "CNY", base: 3842.15 },
  { symbol: "SSE", name: "上证指数", currency: "CNY", base: 3215.4 },
  { symbol: "SZSE", name: "深证成指", currency: "CNY", base: 10128.7 },
  { symbol: "CYB", name: "创业板指", currency: "CNY", base: 2056.3 },
  { symbol: "SPX", name: "标普500", currency: "USD", base: 5430.2 },
  { symbol: "NDX", name: "纳斯达克100", currency: "USD", base: 19250.8 },
];

/** 把行情列表格式化为注入 LLM 的文本。 */
function formatQuotes(quotes: Quote[]): string {
  return quotes
    .map((q) => {
      const trend = q.history
        .slice(-4)
        .map((v) => v.toFixed(1))
        .join(" → ");
      return `- ${q.name}（${q.symbol}）：${q.price.toFixed(2)} ${q.currency}，今日 ${q.changePct >= 0 ? "+" : ""}${q.changePct}%；近期走势 ${trend}`;
    })
    .join("\n");
}

class MarketDataToolImpl implements FinancialTool {
  name = "MarketDataTool";
  label = "市场数据";
  description = "提供股票价格、历史走势与市场宽基指数行情";

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      // params.symbols：可选的自选标的列表；缺省使用默认宽基观察池
      const symbols = Array.isArray(params.symbols)
        ? (params.symbols as string[])
        : DEFAULT_WATCHLIST.map((w) => w.symbol);

      const quotes: Quote[] = symbols.map((sym) => {
        const meta = DEFAULT_WATCHLIST.find((w) => w.symbol === sym);
        const name = meta?.name ?? sym;
        const currency = meta?.currency ?? "CNY";
        const base = meta?.base ?? seededValue(sym, 50, 500);
        const changePct = seededChange(`${sym}-chg`, 3.5);
        const price = Number((base * (1 + changePct / 100)).toFixed(2));

        // 生成近 12 日走势（基于 seed，围绕 base 波动）
        const history: number[] = [];
        let p = base;
        for (let i = 0; i < 12; i++) {
          p = Number((p * (1 + seededChange(`${sym}-h${i}`, 2.2) / 100)).toFixed(2));
          history.push(p);
        }
        history[history.length - 1] = price;

        return { symbol: sym, name, price, changePct, currency, history };
      });

      const summaryLines = formatQuotes(quotes);
      return {
        status: "success",
        summary: `${SIMULATED_DATA_NOTE}\n市场行情（${quotes.length} 个标的）：\n${summaryLines}`,
        data: { quotes },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "市场数据获取失败";
      return { status: "error", summary: `市场数据获取失败：${message}`, error: message };
    }
  }
}

/**
 * 真实 API 接入点（未来替换 Mock）：
 *   const res = await fetch(`https://api.finos-market.example/quote?symbols=${symbols.join(",")}`, {
 *     headers: { Authorization: `Bearer ${process.env.MARKET_API_KEY}` },
 *   });
 *   const quotes = (await res.json()).data; // 映射到 Quote 结构
 * 其余逻辑（格式化、注入）保持不变。
 */
export const marketDataTool = new MarketDataToolImpl();
