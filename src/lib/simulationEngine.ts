import type { FinancialProfile, ProjectionPoint } from "@/data/types";

const DEFAULT_RETURNS: Record<string, number> = {
  conservative: 0.05,
  moderate: 0.07,
  aggressive: 0.09,
};

const SALARY_GROWTH = 0.05;

export interface SimulationModifiers {
  investmentReturn?: number;
  salaryGrowth?: number;
  extraExpense?: number;
  extraIncome?: number;
  extraInvestment?: number;
  extraReturn?: number;
}

export function projectWealth(
  profile: FinancialProfile,
  years: number = 30,
  modifiers: SimulationModifiers = {}
): ProjectionPoint[] {
  const baseReturn = DEFAULT_RETURNS[profile.riskLevel];
  const annualReturn = (modifiers.investmentReturn ?? baseReturn) + (modifiers.extraReturn ?? 0);
  const salaryGrowth = modifiers.salaryGrowth ?? SALARY_GROWTH;
  const extraMonthlyExpense = modifiers.extraExpense ?? 0;
  const extraMonthlyIncome = modifiers.extraIncome ?? 0;
  const extraMonthlyInvestment = modifiers.extraInvestment ?? 0;

  const computedAssets =
    profile.cashSavings +
    profile.stockPortfolio +
    profile.realEstate +
    profile.bonds +
    profile.crypto +
    (profile.funds ?? 0) +
    (profile.house ?? 0) +
    (profile.insurance ?? 0);

  let netWorth = computedAssets - profile.liabilities;
  let monthlySalary = profile.monthlySalary + extraMonthlyIncome;
  const monthlyExpense = profile.monthlyExpenses + extraMonthlyExpense;
  const monthlyInvest = profile.monthlyInvestment + extraMonthlyInvestment;
  const currentYear = new Date().getFullYear();

  const points: ProjectionPoint[] = [];
  const retirementAge = profile.goal.retirementAge;

  points.push({
    age: profile.age,
    year: currentYear,
    assets: netWorth,
    label: "Now",
  });

  for (let i = 1; i <= years; i++) {
    const age = profile.age + i;

    if (i > 1) {
      monthlySalary *= 1 + salaryGrowth;
    }

    const annualSavings =
      (monthlySalary - monthlyExpense - monthlyInvest) * 12;
    const annualInvestment = monthlyInvest * 12;

    const investmentBase = Math.max(netWorth * 0.6, 0);
    const investmentGain = investmentBase * annualReturn;

    const realEstateRatio = computedAssets > 0 ? (profile.realEstate + (profile.house ?? 0)) / computedAssets : 0;
    const realEstateGain = realEstateRatio * netWorth * 0.03;

    const liabilityPayment = Math.min(
      profile.liabilities * 0.04,
      profile.liabilities
    );

    netWorth =
      netWorth +
      annualSavings +
      annualInvestment +
      investmentGain +
      realEstateGain -
      liabilityPayment * 0.02;

    let label: string | undefined;
    if (i === 5) label = "+5 Years";
    else if (i === 10) label = "+10 Years";
    else if (age === retirementAge) label = "Retirement";

    points.push({
      age,
      year: currentYear + i,
      assets: Math.max(netWorth, 0),
      label,
    });
  }

  return points;
}

export function findRetirementAge(
  projection: ProjectionPoint[],
  targetAmount: number
): number {
  for (const point of projection) {
    if (point.assets >= targetAmount) {
      return point.age;
    }
  }
  const last = projection[projection.length - 1];
  if (last.assets > 0 && projection.length > 1) {
    const prev = projection[projection.length - 2];
    if (last.assets > prev.assets) {
      const growthRate = last.assets / prev.assets;
      const gap = targetAmount / last.assets;
      const yearsNeeded = Math.ceil(Math.log(gap) / Math.log(growthRate));
      return last.age + yearsNeeded;
    }
  }
  return 70;
}
