import "server-only";

import type { FinancialTool, ToolResult } from "./types";
import { pseudoRandom, hashString, SIMULATED_DATA_NOTE } from "./mock-utils";

// ── NewsTool（Phase 3.4）────────────────────────────────────────────────────
// 能力：财经新闻检索（标题 / 来源 / 日期 / 情绪）。
// 第一階段：Mock Adapter（基于查询关键词确定性生成）。真实 API 见底部注释。

interface NewsItem {
  title: string;
  source: string;
  date: string;
  sentiment: "positive" | "neutral" | "negative";
}

// 候选新闻模板：用查询关键词填空，保证"看起来真实"且稳定可复现。
const TEMPLATES: { t: string; s: string; tone: NewsItem["sentiment"] }[] = [
  { t: "央行维持稳健货币政策，市场流动性保持合理充裕", s: "财经日报", tone: "positive" },
  { t: "A股宽基指数震荡整理，成交量较前一交易日温和放大", s: "市场观察", tone: "neutral" },
  { t: "美联储释放降息信号，全球风险资产估值承压后回暖", s: "环球金融", tone: "neutral" },
  { t: "十年期国债收益率小幅下行，债市配置价值受关注", s: "固收观察", tone: "positive" },
  { t: "部分行业盈利预期下修，机构提示短期波动风险", s: "投研内参", tone: "negative" },
  { t: "居民部门杠杆率趋稳，消费复苏节奏成为市场焦点", s: "宏观前沿", tone: "neutral" },
  { t: "权益基金发行回暖，长期资金入市渠道进一步拓宽", s: "基金报", tone: "positive" },
];

function pickNews(query: string, limit: number): NewsItem[] {
  // 用查询词决定抽取起点，保证同一问题结果稳定
  const start = hashString(query || "default") % TEMPLATES.length;
  const out: NewsItem[] = [];
  for (let i = 0; i < limit; i++) {
    const tpl = TEMPLATES[(start + i) % TEMPLATES.length];
    const r = pseudoRandom(`${query}-${i}`);
    const daysAgo = Math.floor(r * 6) + 1;
    const date = `2026-07-${String(25 - daysAgo).padStart(2, "0")}`;
    out.push({ title: tpl.t, source: tpl.s, date, sentiment: tpl.tone });
  }
  return out;
}

function formatNews(items: NewsItem[]): string {
  return items
    .map((n) => `- [${n.sentiment === "positive" ? "利好" : n.sentiment === "negative" ? "利空" : "中性"}] ${n.title}（${n.source} ${n.date}）`)
    .join("\n");
}

class NewsToolImpl implements FinancialTool {
  name = "NewsTool";
  label = "财经新闻";
  description = "检索最新财经新闻与市场情绪动态";

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const query =
        typeof params.query === "string" && params.query ? params.query : "宏观经济 市场风险";
      const limit =
        typeof params.limit === "number" && params.limit > 0 ? Math.min(params.limit, 8) : 5;
      const items = pickNews(query, limit);
      return {
        status: "success",
        summary: `${SIMULATED_DATA_NOTE}\n财经新闻（关键词"${query}"，${items.length} 条）：\n${formatNews(items)}`,
        data: { news: items },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "新闻检索失败";
      return { status: "error", summary: `新闻检索失败：${message}`, error: message };
    }
  }
}

/**
 * 真实 API 接入点（未来替换 Mock）：
 *   const res = await fetch(`https://api.finos-news.example/search?q=${encodeURIComponent(query)}`, {
 *     headers: { Authorization: `Bearer ${process.env.NEWS_API_KEY}` },
 *   });
 *   const items = (await res.json()).data; // 映射到 NewsItem 结构
 */
export const newsTool = new NewsToolImpl();
