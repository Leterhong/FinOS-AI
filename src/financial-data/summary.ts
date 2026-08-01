/**
 * 财务数据统计摘要 —— 从真实交易 / 持仓计算 FinancialDataSummary。
 * 纯函数，供 storage / API / Agent / Dashboard 共同消费。
 */

import type {
  AssetAllocationSlice,
  AssetHolding,
  CategoryStat,
  FinancialDataSummary,
  ImportBatch,
  MonthlyCashFlowPoint,
  NormalizedTransaction,
  TransactionCategory,
} from "./types";
import { CATEGORY_LABELS, HOLDING_TYPE_LABELS } from "./types";

/** 计算完整数据摘要 */
export function buildSummary(input: {
  userId: string;
  transactions: NormalizedTransaction[];
  holdings: AssetHolding[];
  imports: ImportBatch[];
  updatedAt: string | null;
}): FinancialDataSummary {
  const { userId, transactions, holdings, imports, updatedAt } = input;
  const hasData = transactions.length > 0 || holdings.length > 0;

  // ---- 时间范围 ----
  const dates = transactions.map((t) => t.date).sort();
  const dateRange =
    dates.length > 0 ? { from: dates[0], to: dates[dates.length - 1] } : null;

  // ---- 月度现金流 ----
  const monthly = new Map<string, { income: number; expense: number }>();
  for (const t of transactions) {
    if (t.direction === "transfer") continue;
    const month = t.date.slice(0, 7);
    const m = monthly.get(month) ?? { income: 0, expense: 0 };
    if (t.amount > 0) m.income += t.amount;
    else m.expense += Math.abs(t.amount);
    monthly.set(month, m);
  }
  const monthlyCashFlow: MonthlyCashFlowPoint[] = [...monthly.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, m]) => {
      const net = m.income - m.expense;
      return {
        month,
        income: round2(m.income),
        expense: round2(m.expense),
        net: round2(net),
        savingsRate: m.income > 0 ? round4(net / m.income) : 0,
      };
    });

  const monthCount = monthlyCashFlow.length || 1;
  const totalIncome = monthlyCashFlow.reduce((s, p) => s + p.income, 0);
  const totalExpense = monthlyCashFlow.reduce((s, p) => s + p.expense, 0);
  const avgMonthlyIncome = round2(totalIncome / monthCount);
  const avgMonthlyExpense = round2(totalExpense / monthCount);
  const avgSavingsRate =
    totalIncome > 0 ? round4((totalIncome - totalExpense) / totalIncome) : 0;

  // ---- 分类统计（仅支出）----
  const catMap = new Map<TransactionCategory, { amount: number; count: number }>();
  for (const t of transactions) {
    if (t.amount >= 0 || t.direction === "transfer") continue;
    const c = catMap.get(t.category) ?? { amount: 0, count: 0 };
    c.amount += Math.abs(t.amount);
    c.count += 1;
    catMap.set(t.category, c);
  }
  const expenseTotal = [...catMap.values()].reduce((s, c) => s + c.amount, 0) || 1;
  const categoryStats: CategoryStat[] = [...catMap.entries()]
    .map(([category, c]) => ({
      category,
      label: CATEGORY_LABELS[category],
      amount: round2(c.amount),
      count: c.count,
      ratio: round4(c.amount / expenseTotal),
    }))
    .sort((a, b) => b.amount - a.amount);

  // ---- 持仓 / 资产配置 ----
  const totalInvestment = round2(holdings.reduce((s, h) => s + h.marketValue, 0));
  const totalProfit = round2(holdings.reduce((s, h) => s + (h.profit ?? 0), 0));
  const allocMap = new Map<AssetHolding["type"], number>();
  for (const h of holdings) {
    allocMap.set(h.type, (allocMap.get(h.type) ?? 0) + h.marketValue);
  }
  const allocTotal = totalInvestment || 1;
  const assetAllocation: AssetAllocationSlice[] = [...allocMap.entries()]
    .map(([type, value]) => ({
      type,
      label: HOLDING_TYPE_LABELS[type],
      value: round2(value),
      ratio: round4(value / allocTotal),
    }))
    .sort((a, b) => b.value - a.value);

  return {
    userId,
    hasData,
    updatedAt,
    transactionCount: transactions.length,
    dateRange,
    avgMonthlyIncome,
    avgMonthlyExpense,
    avgSavingsRate,
    totalAssets: totalInvestment, // 现金部分由 Twin Builder 结合 profile 补充
    totalInvestment,
    totalProfit,
    categoryStats,
    monthlyCashFlow,
    assetAllocation,
    imports: imports.slice(-10).reverse(),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
