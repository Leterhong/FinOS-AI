import "server-only";

/**
 * Portfolio Engine（Phase 6.9 需求四 / 五 / 六 / 十三）。
 *  - 从 financeDb 读取股票 / 基金持仓，结合 Provider 实时行情，
 *    自动计算：当前市值 / 收益率 / 盈亏金额 / 持仓比例 / 今日变化。
 *  - 行情变化会回写 financeDb（marketValue / price），驱动 Financial Twin 同步更新。
 *  - Portfolio Intelligence 本地分析（集中度 / 分布 / 风险暴露 / 波动 / 健康评分）零 LLM。
 */

import { financeDb } from "@/financial-data/storage";
import { rebuildTwinFromData } from "@/financial-data/twin-builder";
import type { AssetHolding } from "@/financial-data/types";
import type {
  AllocationSlice,
  FundNAV,
  PortfolioAnalysis,
  PortfolioFinding,
  PortfolioPosition,
  PortfolioView,
  StockQuote,
} from "../types";
import { INVESTMENT_DISCLAIMER } from "../types";
import { fetchQuotesForUser } from "../market";
import { normalizeSymbol } from "../providers";
import { recordPortfolioSnapshot } from "../market/cache";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** 无投资持仓时的统一空态文案（验收测试 4） */
export const NO_INVESTMENT_TEXT = "暂无投资数据";

/** 投资类持仓过滤：股票 / 基金（有代码才能取行情，无代码也纳入组合但无行情） */
function investmentHoldings(userId: string): AssetHolding[] {
  return financeDb
    .getHoldings(userId)
    .filter((h) => h.type === "stock" || h.type === "fund");
}

/**
 * 构建投资组合视图（核心入口）。
 * @param opts.sync 行情成功后是否回写 financeDb 并重建 Twin（默认 true）
 */
export async function buildPortfolioView(
  userId: string,
  opts: { sync?: boolean } = {},
): Promise<PortfolioView> {
  const sync = opts.sync !== false;
  const holdings = investmentHoldings(userId);
  const now = new Date().toISOString();

  if (holdings.length === 0) {
    return {
      userId,
      hasInvestments: false,
      positions: [],
      totalValue: 0,
      allocation: [],
      dataStatus: "none",
      dataNotice: NO_INVESTMENT_TEXT,
      updatedAt: now,
      disclaimer: INVESTMENT_DISCLAIMER,
    };
  }

  // 收集需要行情的标的
  const stockSymbols: string[] = [];
  const fundCodes: string[] = [];
  for (const h of holdings) {
    if (!h.code) continue;
    if (h.type === "stock") stockSymbols.push(normalizeSymbol(h.code));
    else fundCodes.push(h.code.replace(/\D/g, "") || h.code);
  }

  const fetched = await fetchQuotesForUser(
    userId,
    [...new Set(stockSymbols)],
    [...new Set(fundCodes)],
  );
  const quoteMap = new Map<string, StockQuote>(fetched.quotes.map((q) => [q.symbol, q]));
  const navMap = new Map<string, FundNAV>(fetched.navs.map((n) => [n.code, n]));

  // ── 逐持仓计算 ──
  const positions: PortfolioPosition[] = [];
  let changed = false;

  for (const h of holdings) {
    let currentPrice: number | undefined;
    let todayChangePct: number | undefined;
    let quoteTime: string | undefined;
    let quoteSource: string | undefined;
    let quoteStatus: PortfolioPosition["quoteStatus"] = "none";

    if (h.code) {
      if (h.type === "stock") {
        const q = quoteMap.get(normalizeSymbol(h.code));
        if (q) {
          currentPrice = q.price;
          todayChangePct = q.changePct;
          quoteTime = q.timestamp;
          quoteSource = q.source;
          quoteStatus = fetched.dataStatus === "cached" ? "cached" : "live";
        }
      } else {
        const n = navMap.get(h.code.replace(/\D/g, "") || h.code);
        if (n) {
          currentPrice = n.nav;
          todayChangePct = n.changePct;
          quoteTime = n.timestamp;
          quoteSource = n.source;
          quoteStatus = fetched.dataStatus === "cached" ? "cached" : "live";
        }
      }
    }

    // 市值：有行情且有份额 → shares × price；否则沿用库中市值（导入值）
    let marketValue = h.marketValue;
    if (currentPrice != null && h.shares && h.shares > 0) {
      marketValue = round2(h.shares * currentPrice);
    }

    // 成本：优先 totalCost；否则 shares × cost
    const totalCost =
      h.totalCost ?? (h.shares && h.cost != null ? round2(h.shares * h.cost) : undefined);
    const profit = totalCost != null ? round2(marketValue - totalCost) : undefined;
    const returnRate =
      totalCost && totalCost > 0 && profit != null
        ? Math.round((profit / totalCost) * 10000) / 10000
        : undefined;

    // 行情驱动回写（验收测试 2：行情变化 → 更新投资组合与 Twin）
    if (sync && currentPrice != null && Math.abs(marketValue - h.marketValue) >= 0.01) {
      financeDb.updateHolding(userId, h.id, { marketValue });
      changed = true;
    }

    positions.push({
      holdingId: h.id,
      name: h.name,
      code: h.code,
      type: h.type as "stock" | "fund",
      shares: h.shares,
      costPrice: h.cost,
      currentPrice,
      marketValue,
      totalCost,
      profit,
      returnRate,
      todayChangePct,
      weight: 0, // 稍后统一归一化
      quoteStatus,
      quoteTime,
      quoteSource,
    });
  }

  if (changed) {
    try {
      rebuildTwinFromData(userId);
    } catch {
      /* Twin 重建失败不阻塞组合视图 */
    }
  }

  // ── 组合聚合 ──
  const totalValue = round2(positions.reduce((s, p) => s + p.marketValue, 0));
  for (const p of positions) {
    p.weight = totalValue > 0 ? Math.round((p.marketValue / totalValue) * 10000) / 10000 : 0;
  }

  const costs = positions.map((p) => p.totalCost).filter((c): c is number => c != null);
  const totalCost = costs.length > 0 ? round2(costs.reduce((a, b) => a + b, 0)) : undefined;
  const totalProfit =
    totalCost != null
      ? round2(
          positions.reduce(
            (s, p) => s + (p.profit ?? 0),
            0,
          ),
        )
      : undefined;
  const totalReturnRate =
    totalCost && totalCost > 0 && totalProfit != null
      ? Math.round((totalProfit / totalCost) * 10000) / 10000
      : undefined;

  // 今日变化：基于有今日涨跌幅的持仓
  let todayChangeValue = 0;
  let todayBase = 0;
  for (const p of positions) {
    if (p.todayChangePct != null) {
      const prevValue = p.marketValue / (1 + p.todayChangePct / 100);
      todayChangeValue += p.marketValue - prevValue;
      todayBase += prevValue;
    }
  }
  const hasToday = todayBase > 0;

  // 资产分布
  const byType = new Map<string, number>();
  for (const p of positions) {
    byType.set(p.type, (byType.get(p.type) ?? 0) + p.marketValue);
  }
  const TYPE_LABEL: Record<string, string> = { stock: "股票", fund: "基金" };
  const allocation: AllocationSlice[] = [...byType.entries()].map(([key, value]) => ({
    key,
    label: TYPE_LABEL[key] ?? key,
    value: round2(value),
    weight: totalValue > 0 ? Math.round((value / totalValue) * 10000) / 10000 : 0,
  }));

  // 收益曲线日快照
  recordPortfolioSnapshot(userId, {
    date: now.slice(0, 10),
    value: totalValue,
    profit: totalProfit,
  });

  return {
    userId,
    hasInvestments: true,
    positions,
    totalValue,
    totalCost,
    totalProfit,
    totalReturnRate,
    todayChangeValue: hasToday ? round2(todayChangeValue) : undefined,
    todayChangePct: hasToday
      ? Math.round((todayChangeValue / todayBase) * 10000) / 100
      : undefined,
    allocation,
    dataStatus: fetched.dataStatus,
    dataNotice: fetched.dataNotice,
    sourceName: fetched.sourceName,
    updatedAt: now,
    disclaimer: INVESTMENT_DISCLAIMER,
  };
}

/* -------------------------------------------------------------------------- */
/*  Portfolio Intelligence 本地分析（需求六，零 LLM）                              */
/* -------------------------------------------------------------------------- */

/** 集中度阈值（与 Phase 6.8 保持一致的口径） */
const TOP_POSITION_WARN = 0.5;
const TOP_POSITION_CRITICAL = 0.7;

export function analyzePortfolio(view: PortfolioView): PortfolioAnalysis | null {
  if (!view.hasInvestments || view.positions.length === 0) return null;

  const findings: PortfolioFinding[] = [];
  let score = 100;

  // 1) 单一持仓集中度
  const top = [...view.positions].sort((a, b) => b.weight - a.weight)[0];
  const topWeight = top?.weight ?? 0;
  let concentration: PortfolioAnalysis["concentration"] = "low";
  if (topWeight >= TOP_POSITION_CRITICAL) {
    concentration = "high";
    score -= 25;
    findings.push({
      severity: "critical",
      title: "单一持仓高度集中",
      detail: `「${top.name}」占投资组合 ${(topWeight * 100).toFixed(1)}%，超过 ${TOP_POSITION_CRITICAL * 100}% 警戒线，单一标的波动将主导整体收益。`,
    });
  } else if (topWeight >= TOP_POSITION_WARN) {
    concentration = "medium";
    score -= 12;
    findings.push({
      severity: "warn",
      title: "单一持仓占比偏高",
      detail: `「${top.name}」占投资组合 ${(topWeight * 100).toFixed(1)}%，建议关注分散度。`,
    });
  }

  // 2) 类别分布
  const stockShare = view.allocation.find((a) => a.key === "stock")?.weight ?? 0;
  const fundShare = view.allocation.find((a) => a.key === "fund")?.weight ?? 0;
  if (view.positions.length === 1) {
    score -= 8;
    findings.push({
      severity: "warn",
      title: "持仓数量过少",
      detail: "组合仅有 1 个标的，缺乏分散，风险暴露集中。",
    });
  }

  // 3) 深度亏损持仓
  const deepLoss = view.positions.filter((p) => (p.returnRate ?? 0) <= -0.2);
  if (deepLoss.length > 0) {
    score -= Math.min(15, deepLoss.length * 8);
    findings.push({
      severity: "warn",
      title: "存在深度亏损持仓",
      detail: `${deepLoss.map((p) => `「${p.name}」(${((p.returnRate ?? 0) * 100).toFixed(1)}%)`).join("、")} 亏损超过 20%，建议复核持有逻辑。`,
    });
  }

  // 4) 波动情况：持仓今日涨跌幅的标准差（数据不足则缺省）
  const pcts = view.positions
    .map((p) => p.todayChangePct)
    .filter((p): p is number => typeof p === "number");
  let volatilityPct: number | undefined;
  if (pcts.length >= 2) {
    const mean = pcts.reduce((a, b) => a + b, 0) / pcts.length;
    const variance = pcts.reduce((s, p) => s + (p - mean) ** 2, 0) / pcts.length;
    volatilityPct = Math.round(Math.sqrt(variance) * 100) / 100;
    if (volatilityPct >= 4) {
      score -= 8;
      findings.push({
        severity: "warn",
        title: "持仓波动分化明显",
        detail: `今日各持仓涨跌离散度 ${volatilityPct.toFixed(2)}%，组合内部波动较大。`,
      });
    }
  }

  // 5) 行情覆盖率（数据质量提示，不扣分逻辑温和）
  const noQuote = view.positions.filter((p) => p.quoteStatus === "none");
  if (noQuote.length > 0) {
    findings.push({
      severity: "info",
      title: "部分持仓缺少实时行情",
      detail: `${noQuote.map((p) => `「${p.name}」`).join("、")} 未配置代码或数据源不覆盖，按最近录入市值计算。`,
    });
  }

  if (findings.length === 0) {
    findings.push({
      severity: "info",
      title: "组合结构基本健康",
      detail: "未发现明显的集中度或深度亏损问题，请继续保持定期检视。",
    });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const scoreGrade =
    score >= 85 ? "excellent" : score >= 70 ? "good" : score >= 50 ? "fair" : "poor";

  return {
    healthScore: score,
    scoreGrade,
    topPositionWeight: topWeight,
    topPositionName: top?.name,
    stockShare,
    fundShare,
    concentration,
    volatilityPct,
    findings,
    computedAt: new Date().toISOString(),
  };
}
