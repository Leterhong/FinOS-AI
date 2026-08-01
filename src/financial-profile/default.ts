import type { FinancialProfile, LifeGoal } from "@/data/types";
import type { OnboardingInput, OnboardingGoal } from "./types";

// Financial Twin 6.x：系统不再提供任何默认 / 演示画像，
// 所有画像必须来源于真实注册用户的 Onboarding 输入。

/** 各风险等级下的默认资产配置比例（合计 1.0）。 */
const ALLOCATION_BY_RISK: Record<
  FinancialProfile["riskLevel"],
  Record<string, number>
> = {
  aggressive: {
    cashSavings: 0.15,
    stockPortfolio: 0.45,
    funds: 0.25,
    realEstate: 0,
    house: 0,
    bonds: 0.05,
    crypto: 0.05,
    insurance: 0.05,
  },
  moderate: {
    cashSavings: 0.25,
    stockPortfolio: 0.3,
    funds: 0.25,
    realEstate: 0.05,
    house: 0,
    bonds: 0.05,
    crypto: 0,
    insurance: 0.1,
  },
  conservative: {
    cashSavings: 0.4,
    stockPortfolio: 0.15,
    funds: 0.25,
    realEstate: 0.05,
    house: 0,
    bonds: 0.1,
    crypto: 0,
    insurance: 0.05,
  },
};

/** 将 Onboarding 输入转换为完整 FinancialProfile。 */
export function buildProfileFromOnboarding(input: OnboardingInput): FinancialProfile {
  const riskLevel = input.riskLevel;
  const totalAssets = Math.max(input.totalAssets, 0);
  const liabilities = input.liabilities ?? 0;

  const monthlySalary = input.monthlyIncome;
  const monthlyExpenses = input.monthlyExpenses ?? Math.round(monthlySalary * 0.4);
  const monthlyInvestment = input.monthlyInvestment ?? Math.round(monthlySalary * 0.2);

  // 资产细分
  const alloc = ALLOCATION_BY_RISK[riskLevel];
  const bd = input.assetBreakdown ?? {};
  const profile: FinancialProfile = {
    name: input.name?.trim() || "我的财富分身",
    age: input.age,
    occupation: input.occupation,
    familyStatus: input.familyStatus,
    dependents: input.dependents,
    monthlySalary,
    totalAssets,
    liabilities,
    monthlyExpenses,
    monthlyInvestment,
    cashSavings: bd.cashSavings ?? Math.round(totalAssets * alloc.cashSavings),
    stockPortfolio: bd.stockPortfolio ?? Math.round(totalAssets * alloc.stockPortfolio),
    realEstate: bd.realEstate ?? Math.round(totalAssets * alloc.realEstate),
    bonds: bd.bonds ?? Math.round(totalAssets * alloc.bonds),
    crypto: bd.crypto ?? Math.round(totalAssets * alloc.crypto),
    funds: bd.funds ?? Math.round(totalAssets * alloc.funds),
    insurance: bd.insurance ?? Math.round(totalAssets * alloc.insurance),
    house: bd.house ?? Math.round(totalAssets * alloc.house),
    riskLevel,
    riskExperience: input.riskExperience,
    riskTolerance:
      riskLevel === "aggressive" ? "high" : riskLevel === "moderate" ? "medium" : "low",
    goal: {
      retirementAge: input.retirementAge ?? 60,
      targetAmount: input.retirementTarget ?? 8_000_000,
    },
    modifiers: { extraExpense: 0, extraIncome: 0, extraInvestment: 0, extraReturn: 0 },
  };

  // 目标清单：用户目标 + 退休目标（始终存在）
  profile.goals = buildGoals(input);

  return profile;
}

function buildGoals(input: OnboardingInput): LifeGoal[] {
  const goals: LifeGoal[] = (input.goals ?? []).map((g: OnboardingGoal, i) => ({
    id: `goal-${g.type}-${i}`,
    type: g.type,
    label: g.label,
    targetYear: g.targetYear,
    targetAmount: g.targetAmount,
    horizonYears: g.targetYear ? g.targetYear - new Date().getFullYear() : undefined,
    priority: g.priority ?? "medium",
    status: "active",
  }));

  // 确保退休目标存在
  if (!goals.some((g) => g.type === "retirement")) {
    const retireYear = new Date().getFullYear() + (input.retirementAge ?? 60) - input.age;
    goals.push({
      id: "goal-retirement",
      type: "retirement",
      label: `${input.retirementAge ?? 60} 岁退休`,
      targetYear: retireYear,
      targetAmount: input.retirementTarget ?? 8_000_000,
      horizonYears: retireYear - new Date().getFullYear(),
      priority: "high",
      status: "active",
    });
  }
  return goals;
}
