import type {
  FinancialProfile,
  ScenarioDefinition,
  CashFlow,
  RiskMetrics,
  AssetClass,
  ProjectionPoint,
  MonthlyTrend,
} from "@/data/types";
import { projectWealth, findRetirementAge } from "@/lib/simulationEngine";

// ── Scenario Definitions ──────────────────────────────────────────────────────

export const scenarios: Record<string, ScenarioDefinition> = {
  buyHouse: {
    id: "buyHouse",
    label: "购房",
    icon: "Home",
    description: "购置一套 ¥200 万房产，首付 30%",
    plannerHint: "购房减少现金、增加房贷、提高月度支出",
    mutate: (p) => ({
      cashSavings: p.cashSavings - 600000,
      house: p.house + 2000000,
      liabilities: p.liabilities + 1400000,
      modifiers: {
        ...p.modifiers,
        extraExpense: p.modifiers.extraExpense + 8000,
      },
    }),
  },

  startBusiness: {
    id: "startBusiness",
    label: "创业",
    icon: "Rocket",
    // Phase 3.5 升级：创业资本基于用户画像动态计算（现金×30%，封顶 50 万）
    description: "投入部分现金创业，潜在高回报（按画像动态计算）",
    plannerHint: "减少现金用于创业资本，提高收益潜力",
    mutate: (p) => {
      const capital = Math.min(Math.round(p.cashSavings * 0.3), 500000);
      return {
        cashSavings: Math.max(p.cashSavings - capital, 0),
        modifiers: {
          ...p.modifiers,
          extraReturn: p.modifiers.extraReturn + 0.04,
        },
      };
    },
  },

  careerChange: {
    id: "careerChange",
    label: "换工作",
    icon: "Briefcase",
    description: "跳槽，薪资上涨 35%",
    plannerHint: "更高薪资提升收入与投资能力",
    mutate: (p) => ({
      monthlySalary: p.monthlySalary * 1.35,
      modifiers: {
        ...p.modifiers,
        extraInvestment: p.modifiers.extraInvestment + 4000,
      },
    }),
  },

  getMarried: {
    id: "getMarried",
    label: "结婚",
    icon: "Heart",
    description: "双收入，支出增加",
    plannerHint: "配偶收入并入家庭现金流，共享支出",
    mutate: (p) => ({
      modifiers: {
        ...p.modifiers,
        extraIncome: p.modifiers.extraIncome + 25000,
        extraExpense: p.modifiers.extraExpense + 8000,
      },
    }),
  },

  haveChild: {
    id: "haveChild",
    label: "生育",
    icon: "Baby",
    description: "每月支出增加 ¥1.2 万",
    plannerHint: "育儿相关成本显著影响月度现金流",
    mutate: (p) => ({
      modifiers: {
        ...p.modifiers,
        extraExpense: p.modifiers.extraExpense + 12000,
      },
    }),
  },

  increaseInvestment: {
    id: "increaseInvestment",
    label: "增加投资",
    icon: "TrendingUp",
    description: "每月投资增加 ¥2,000",
    plannerHint: "更高投资比例加速复利增长",
    mutate: (p) => ({
      monthlyInvestment: p.monthlyInvestment + 2000,
      modifiers: {
        ...p.modifiers,
        extraInvestment: p.modifiers.extraInvestment + 2000,
      },
    }),
  },

  salaryIncrease: {
    id: "salaryIncrease",
    label: "加薪 / 晋升",
    icon: "TrendingUp",
    description: "薪资上涨 20%",
    plannerHint: "加薪改善储蓄率与投资能力",
    mutate: (p) => ({
      monthlySalary: p.monthlySalary * 1.2,
      modifiers: {
        ...p.modifiers,
        extraInvestment: p.modifiers.extraInvestment + 3000,
      },
    }),
  },

  salaryDecrease: {
    id: "salaryDecrease",
    label: "收入减少",
    icon: "TrendingDown",
    description: "薪资下降 15%（如兼职、职业中断）",
    plannerHint: "收入降低减少储蓄并延后退休时间线",
    mutate: (p) => ({
      monthlySalary: p.monthlySalary * 0.85,
      modifiers: {
        ...p.modifiers,
        extraInvestment: Math.max(p.modifiers.extraInvestment - 3000, -p.monthlyInvestment),
      },
    }),
  },

  earlyRetirement: {
    id: "earlyRetirement",
    label: "提前退休",
    icon: "Clock",
    description: "目标退休年龄 40 岁",
    plannerHint: "更早退休需要更高的储蓄率与收益",
    mutate: (p) => ({
      goal: {
        ...p.goal,
        retirementAge: 40,
      },
    }),
  },
};

// ── Pure Compute Functions ───────────────────────────────────────────────────

export function getEffectiveProfile(profile: FinancialProfile): FinancialProfile {
  // Returns profile with modifiers baked into the effective values for computation
  return {
    ...profile,
    totalAssets:
      profile.cashSavings +
      profile.stockPortfolio +
      profile.realEstate +
      profile.bonds +
      profile.crypto +
      profile.funds +
      profile.house +
      profile.insurance,
  };
}

export function computeCashFlow(profile: FinancialProfile): CashFlow {
  const effectiveIncome =
    profile.monthlySalary + profile.modifiers.extraIncome;
  const effectiveExpenses =
    profile.monthlyExpenses + profile.modifiers.extraExpense;
  // Savings rate = (expenses covered + investment + surplus) / income = total retained
  const totalRetained = effectiveIncome - effectiveExpenses;
  const savingsRate = effectiveIncome > 0 ? (totalRetained / effectiveIncome) * 100 : 0;

  return {
    income: effectiveIncome,
    expenses: effectiveExpenses,
    savings: totalRetained,
    savingsRate,
  };
}

export function computeRiskMetrics(profile: FinancialProfile): RiskMetrics {
  const effectiveIncome =
    profile.monthlySalary + profile.modifiers.extraIncome;
  const effectiveExpenses =
    profile.monthlyExpenses + profile.modifiers.extraExpense;
  const totalAssets =
    profile.cashSavings +
    profile.stockPortfolio +
    profile.realEstate +
    profile.bonds +
    profile.crypto +
    profile.funds +
    profile.house +
    profile.insurance;

  const debtToIncome = effectiveIncome > 0
    ? (profile.liabilities / (effectiveIncome * 12)) * 100
    : 100;
  const debtToAssets = totalAssets > 0
    ? (profile.liabilities / totalAssets) * 100
    : 100;
  const emergencyMonths = effectiveExpenses > 0
    ? profile.cashSavings / effectiveExpenses
    : 0;

  const debtRisk = Math.min(Math.round(debtToIncome * 0.6 + debtToAssets * 0.4), 100);
  const investmentRiskScore =
    profile.riskLevel === "aggressive" ? 55 :
    profile.riskLevel === "moderate" ? 35 : 15;
  const cashFlowRiskScore =
    emergencyMonths > 6 ? 15 :
    emergencyMonths > 3 ? 25 :
    emergencyMonths > 1 ? 50 : 75;
  const overall = Math.round(
    100 - (debtRisk + investmentRiskScore + cashFlowRiskScore) / 3
  );

  return {
    debtRisk,
    investmentRisk: investmentRiskScore,
    cashFlowRisk: cashFlowRiskScore,
    overall: Math.max(0, Math.min(100, overall)),
  };
}

export function buildAssetAllocation(profile: FinancialProfile): AssetClass[] {
  return [
    { name: "现金", value: profile.cashSavings, color: "#0EA5E9" },
    { name: "股票", value: profile.stockPortfolio, color: "#00D68F" },
    { name: "基金", value: profile.funds, color: "#22D3EE" },
    { name: "房地产", value: profile.realEstate, color: "#34D399" },
    { name: "房产", value: profile.house, color: "#2DD4BF" },
    { name: "债券", value: profile.bonds, color: "#F59E0B" },
    { name: "加密货币", value: profile.crypto, color: "#EF4444" },
    { name: "保险", value: profile.insurance, color: "#38BDF8" },
  ].filter((a) => a.value > 0);
}

export function computeProjection(profile: FinancialProfile): ProjectionPoint[] {
  const years = Math.max(profile.goal.retirementAge - profile.age + 10, 30);
  return projectWealth(profile, years, {
    extraExpense: profile.modifiers.extraExpense,
    extraIncome: profile.modifiers.extraIncome,
    extraInvestment: profile.modifiers.extraInvestment,
    extraReturn: profile.modifiers.extraReturn,
  });
}

export function computeProjectedRetireAge(
  profile: FinancialProfile,
  projection: ProjectionPoint[]
): number {
  return findRetirementAge(projection, profile.goal.targetAmount);
}

// ── Scenario Application ──────────────────────────────────────────────────────

export function applyScenario(
  profile: FinancialProfile,
  scenarioId: string
): FinancialProfile {
  const scenario = scenarios[scenarioId];
  if (!scenario) return profile;

  const mutations = scenario.mutate(profile);

  // Extract modifiers separately so they don't double-spread
  const newModifiers = {
    extraExpense: mutations.modifiers?.extraExpense ?? profile.modifiers.extraExpense,
    extraIncome: mutations.modifiers?.extraIncome ?? profile.modifiers.extraIncome,
    extraInvestment: mutations.modifiers?.extraInvestment ?? profile.modifiers.extraInvestment,
    extraReturn: mutations.modifiers?.extraReturn ?? profile.modifiers.extraReturn,
  };

  // Build profile without modifiers field from mutations
  const { modifiers: _ignored, ...profileMutations } = mutations;
  void _ignored;

  return {
    ...profile,
    ...profileMutations,
    modifiers: newModifiers,
  };
}

export function removeScenario(
  profile: FinancialProfile,
  scenarioId: string,
  baseProfile: FinancialProfile
): FinancialProfile {
  // For simplicity, we track active event IDs in the store
  // and rebuild profile from base + remaining events.
  // This is handled at the store level; here we just return base.
  // (The store calls recomputeAll with remaining events.)
  void scenarioId;
  return baseProfile;
}

// ── Monthly trend（Phase 6.3 #217：删除硬编码 Demo 数据）──────────────────────
//
// 旧实现是一段写死的演示收支数组，所有用户共用 → 违反「新用户无演示资产」。
// 现改为从用户画像派生：值全部来自用户自己填写 / 导入重建的画像，无任何虚构波动。
// 若用户导入了真实流水，store 会用 financialSummary.monthlyCashFlow 覆盖本派生值。

export function deriveMonthlyTrend(profile: FinancialProfile): MonthlyTrend[] {
  const income = Math.max(profile.monthlySalary, 0);
  const expenses = Math.max(profile.monthlyExpenses, 0);
  // 空画像（未创建 / 全零）→ 空数组，前端展示空状态而非假数据
  if (income <= 0 && expenses <= 0) return [];
  const out: MonthlyTrend[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ month: `${d.getMonth() + 1}月`, income, expenses });
  }
  return out;
}
