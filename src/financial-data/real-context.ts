/**
 * FinancialDataSummary → Agent 上下文 realData 精简结构。
 * 控制注入 prompt 的体积：月度现金流最多 12 个月、分类 TOP8、持仓 TOP15。
 * 纯函数。
 */

import type { FinancialContextData } from "@/ai/types";
import type { FinancialDataSummary } from "./types";
import { HOLDING_TYPE_LABELS } from "./types";

export function toRealDataContext(
  summary: FinancialDataSummary,
  holdings: { name: string; type: keyof typeof HOLDING_TYPE_LABELS; marketValue: number; profit?: number; returnRate?: number }[],
): NonNullable<FinancialContextData["realData"]> | undefined {
  if (!summary.hasData) return undefined;

  return {
    dateRange: summary.dateRange,
    transactionCount: summary.transactionCount,
    avgMonthlyIncome: summary.avgMonthlyIncome,
    avgMonthlyExpense: summary.avgMonthlyExpense,
    avgSavingsRate: summary.avgSavingsRate,
    monthlyCashFlow: summary.monthlyCashFlow.slice(-12),
    topCategories: summary.categoryStats.slice(0, 8).map((c) => ({
      label: c.label,
      amount: c.amount,
      ratio: c.ratio,
      count: c.count,
    })),
    holdings: holdings
      .slice()
      .sort((a, b) => b.marketValue - a.marketValue)
      .slice(0, 15)
      .map((h) => ({
        name: h.name,
        type: HOLDING_TYPE_LABELS[h.type] ?? String(h.type),
        marketValue: h.marketValue,
        profit: h.profit,
        returnRate: h.returnRate,
      })),
    totalInvestment: summary.totalInvestment,
    totalProfit: summary.totalProfit,
    updatedAt: summary.updatedAt,
  };
}
