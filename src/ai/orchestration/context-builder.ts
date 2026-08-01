/**
 * Context Builder（Phase 6.5 九）—— Prompt 上下文压缩。
 *
 * 不再把用户全部原始数据塞进 Prompt，而是生成一份极简「用户摘要」
 * （年龄 / 净资产 / 风险等级 / 目标），只发送摘要，显著降低输入 Token。
 */
import type { FinancialProfile } from "@/data/types";
import { totalAssetsOf } from "./change-detector";

export function buildSummary(profile: FinancialProfile): string {
  const totalAssets = totalAssetsOf(profile);
  const netWorth = totalAssets - (profile.liabilities || 0);
  const risk = profile.riskLevel ?? "未设定";
  const goal = profile.goal?.retirementAge
    ? `${profile.goal.retirementAge} 岁退休`
    : "退休目标未设定";
  const income = profile.monthlySalary ? `月薪约 ¥${profile.monthlySalary.toLocaleString()}` : "收入未设定";
  return [
    "用户摘要：",
    `年龄 ${profile.age || "?"}`,
    `净资产约 ¥${Math.round(netWorth).toLocaleString()}`,
    `风险等级 ${risk}`,
    `目标 ${goal}`,
    income,
  ].join("，") + "。";
}

/** 用于缓存键的画像稳定摘要（仅数值，避免噪声字段影响哈希）。 */
export function compactProfile(p: FinancialProfile): Record<string, number> {
  return {
    age: p.age || 0,
    cashSavings: p.cashSavings || 0,
    stockPortfolio: p.stockPortfolio || 0,
    realEstate: p.realEstate || 0,
    bonds: p.bonds || 0,
    funds: p.funds || 0,
    crypto: p.crypto || 0,
    house: p.house || 0,
    insurance: p.insurance || 0,
    liabilities: p.liabilities || 0,
    monthlySalary: p.monthlySalary || 0,
    monthlyExpenses: p.monthlyExpenses || 0,
    monthlyInvestment: p.monthlyInvestment || 0,
    retirementAge: p.goal?.retirementAge || 0,
    targetAmount: p.goal?.targetAmount || 0,
  };
}
