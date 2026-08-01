import "server-only";

/**
 * Twin Builder —— 用真实金融数据驱动 Financial Twin。
 * 从数据库读取交易 / 持仓 / 保单，计算月均收入、支出、投资、持仓结构，
 * 回写 FinancialProfile（profileManager），再用 computeTwin 重算数字孪生。
 * 让 Twin 从「用户手动输入」升级为「真实数据驱动」。
 */

import { profileManager } from "@/financial-profile";
import type { FinancialProfile } from "@/data/types";
import { computeTwin, type TwinSnapshot } from "@/twin/engine";
import { financeDb } from "./storage";
import { buildSummary } from "./summary";
import type { FinancialDataSummary } from "./types";

export interface TwinRebuildResult {
  /** 是否有数据可用 */
  applied: boolean;
  /** 回写的 profile 字段 */
  updates: Partial<FinancialProfile>;
  /** 重算后的孪生快照 */
  twin: TwinSnapshot | null;
  /** 数据摘要 */
  summary: FinancialDataSummary;
}

/**
 * 用真实数据重建用户的 Financial Twin。
 * 更新策略（有数据才覆盖，缺失字段保留用户原值）：
 * - monthlySalary   ← 月均工资类收入
 * - monthlyExpenses ← 月均支出
 * - monthlyInvestment ← 月均投资类支出
 * - stockPortfolio  ← 股票持仓市值
 * - funds           ← 基金持仓市值
 * - insurance       ← 保单年缴保费合计（作为保险资产近似）
 */
export function rebuildTwinFromData(userId: string): TwinRebuildResult {
  const record = financeDb.load(userId);
  const summary = buildSummary({
    userId,
    transactions: record.transactions,
    holdings: record.holdings,
    imports: record.imports,
    updatedAt: record.updatedAt,
  });

  // 确保画像存在：首次通过文档 / 导入建立数据时无画像，也要能重算 Twin
  const rec = profileManager.ensureProfile(userId);

  const updates: Partial<FinancialProfile> = {};

  if (summary.hasData) {
    // ---- 现金流 ----
    const salaryTx = record.transactions.filter(
      (t) => t.category === "salary" && t.amount > 0,
    );
    if (salaryTx.length > 0) {
      const months = new Set(salaryTx.map((t) => t.date.slice(0, 7))).size || 1;
      const totalSalary = salaryTx.reduce((s, t) => s + t.amount, 0);
      updates.monthlySalary = Math.round(totalSalary / months);
    }
    if (summary.avgMonthlyExpense > 0) {
      updates.monthlyExpenses = Math.round(summary.avgMonthlyExpense);
    }

    const investTx = record.transactions.filter(
      (t) => t.category === "investment" && t.amount < 0,
    );
    if (investTx.length > 0) {
      const months = new Set(investTx.map((t) => t.date.slice(0, 7))).size || 1;
      const totalInvest = investTx.reduce((s, t) => s + Math.abs(t.amount), 0);
      updates.monthlyInvestment = Math.round(totalInvest / months);
    }

    // ---- 持仓：全类型资产回写（有数据才覆盖）----
    const sumByType = (type: (typeof record.holdings)[number]["type"]) =>
      record.holdings
        .filter((h) => h.type === type)
        .reduce((s, h) => s + h.marketValue, 0);

    const stockValue = sumByType("stock");
    if (stockValue > 0) updates.stockPortfolio = Math.round(stockValue);

    const fundValue = sumByType("fund");
    if (fundValue > 0) updates.funds = Math.round(fundValue);

    const cashValue = sumByType("cash");
    if (cashValue > 0) updates.cashSavings = Math.round(cashValue);

    const bondValue = sumByType("bond");
    if (bondValue > 0) updates.bonds = Math.round(bondValue);

    const cryptoValue = sumByType("crypto");
    if (cryptoValue > 0) updates.crypto = Math.round(cryptoValue);

    const realEstateValue = sumByType("realestate");
    if (realEstateValue > 0) updates.realEstate = Math.round(realEstateValue);

    // ---- 保险 ----
    const premiumTotal = record.policies.reduce((s, p) => s + (p.premium ?? 0), 0);
    if (premiumTotal > 0) updates.insurance = Math.round(premiumTotal);

    // ---- 总资产重估：现金 + 各类持仓 + 房产等 ----
    const p = { ...rec.profile, ...updates };
    const total =
      (p.cashSavings ?? 0) +
      (p.stockPortfolio ?? 0) +
      (p.funds ?? 0) +
      (p.bonds ?? 0) +
      (p.crypto ?? 0) +
      (p.realEstate ?? 0);
    if (total > 0) updates.totalAssets = Math.round(total);
  }

  let profile = rec.profile;
  if (Object.keys(updates).length > 0) {
    const updated = profileManager.updateProfile(userId, updates);
    if (updated) profile = updated.profile;
  }

  const twin = computeTwin(profile);
  return { applied: Object.keys(updates).length > 0, updates, twin, summary };
}
