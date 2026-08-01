/**
 * FinancialChangeDetector（Phase 6.5 五）。
 *
 * 检测用户画像变化，生成 changeScore：
 *   - low  （< 5%）：使用缓存，不重新分析
 *   - medium（5%–15% 或目标变化）：提示用户更新
 *   - high （≥ 15%）：触发重新分析（后台优先级任务）
 *
 * 规则阈值可在此调整；默认：任一维度 ≥15% → high；≥5% 或目标变化 → medium。
 */
import type { FinancialProfile } from "@/data/types";
import type { ChangeReport, ChangeScore } from "./types";

export function totalAssetsOf(p: FinancialProfile): number {
  return (
    (p.cashSavings || 0) +
    (p.stockPortfolio || 0) +
    (p.realEstate || 0) +
    (p.bonds || 0) +
    (p.crypto || 0) +
    (p.funds || 0) +
    (p.house || 0) +
    (p.insurance || 0)
  );
}

function pctChange(oldV: number, newV: number): number {
  if (!oldV) return newV ? 1 : 0; // 从 0 → 非零，视为 100% 变化
  return Math.abs(newV - oldV) / Math.abs(oldV);
}

export function detectChanges(
  prev: FinancialProfile | null,
  curr: FinancialProfile
): ChangeReport {
  if (!prev) {
    return {
      assetChangePct: 0,
      incomeChangePct: 0,
      expenseChangePct: 0,
      portfolioChangePct: 0,
      goalChange: false,
      changeScore: "low",
    };
  }

  const assetChangePct = pctChange(totalAssetsOf(prev), totalAssetsOf(curr));
  const incomeChangePct = pctChange(prev.monthlySalary || 0, curr.monthlySalary || 0);
  const expenseChangePct = pctChange(prev.monthlyExpenses || 0, curr.monthlyExpenses || 0);
  const portfolioChangePct = pctChange(
    (prev.stockPortfolio || 0) + (prev.funds || 0) + (prev.bonds || 0),
    (curr.stockPortfolio || 0) + (curr.funds || 0) + (curr.bonds || 0)
  );
  const goalChange =
    (prev.goal?.retirementAge || 0) !== (curr.goal?.retirementAge || 0) ||
    (prev.goal?.targetAmount || 0) !== (curr.goal?.targetAmount || 0);

  const max = Math.max(assetChangePct, incomeChangePct, expenseChangePct, portfolioChangePct);

  let changeScore: ChangeScore = "low";
  if (max >= 0.15 || (goalChange && max >= 0.15)) {
    changeScore = "high";
  } else if (max >= 0.05 || goalChange) {
    changeScore = "medium";
  }

  return {
    assetChangePct,
    incomeChangePct,
    expenseChangePct,
    portfolioChangePct,
    goalChange,
    changeScore,
  };
}
