import type { FinancialProfile, LifeGoal } from "@/data/types";

/** 持久化的用户画像记录（Phase 3.5 Profile Manager）。 */
export interface UserProfileRecord {
  userId: string;
  profile: FinancialProfile;
  /** 是否已完成首次 Onboarding（false 时使用默认 Demo 画像）。 */
  isOnboarded: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Onboarding 收集的单项目标。 */
export interface OnboardingGoal {
  type: LifeGoal["type"];
  label: string;
  targetYear?: number;
  targetAmount?: number;
  priority?: "high" | "medium" | "low";
}

/**
 * AI 财富初始化助手收集的结构化输入：
 * 年龄 / 收入 / 资产 / 家庭 / 目标 / 风险偏好。
 */
export interface OnboardingInput {
  /** 用户显示名（缺省 "我的财富分身"）。 */
  name?: string;
  age: number;
  occupation?: string;
  familyStatus?: "single" | "married" | "family" | "other";
  dependents?: number;
  /** 月收入（元）。 */
  monthlyIncome: number;
  /** 月支出（缺省按收入 40% 估算）。 */
  monthlyExpenses?: number;
  /** 月投资（缺省按收入 20% 估算）。 */
  monthlyInvestment?: number;
  /** 总资产（元）。 */
  totalAssets: number;
  /** 资产细分（缺省按风险等级自动估算比例）。 */
  assetBreakdown?: Partial<
    Pick<
      FinancialProfile,
      | "cashSavings"
      | "stockPortfolio"
      | "funds"
      | "realEstate"
      | "house"
      | "bonds"
      | "crypto"
      | "insurance"
    >
  >;
  /** 总负债（缺省 0）。 */
  liabilities?: number;
  riskLevel: "conservative" | "moderate" | "aggressive";
  riskExperience?: "none" | "some" | "experienced";
  goals: OnboardingGoal[];
  /** 目标退休年龄（缺省 60）。 */
  retirementAge?: number;
  /** 退休目标资产（缺省 800 万）。 */
  retirementTarget?: number;
  /** 可选指定 userId（验收/测试用），缺省自动生成。 */
  userId?: string;
}

/** 用户列表摘要。 */
export interface UserSummary {
  userId: string;
  name: string;
  age: number;
  isOnboarded: boolean;
  updatedAt: number;
}
