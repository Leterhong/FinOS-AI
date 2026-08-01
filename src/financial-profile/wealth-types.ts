/**
 * 财富初始化画像类型定义（Phase 5.8 / Financial Twin 6.x 扩展）。
 *
 * 对应需求「financial_profiles」库，承载真实用户通过财富初始化引导
 * （/onboarding/wealth）录入的结构化数据。与系统计算用的 FinancialProfile
 * 解耦：WealthProfile 是录入源（贴近表单），FinancialProfile 是计算镜像。
 *
 * 原则：所有数值 0 / 空串 = 用户未填写（未设定），系统绝不伪造默认值。
 */

/** 婚姻状态。 */
export type MaritalStatus = "single" | "married" | "divorced" | "widowed";

/** 收入来源（多选）。 */
export type IncomeSource =
  | "salary" // 工资
  | "business" // 创业 / 经营
  | "investment" // 投资收益
  | "parttime" // 兼职
  | "other";

/** 收入稳定性。 */
export type IncomeStability = "stable" | "medium" | "volatile";

/** 财务目标类型。 */
export type WealthGoalType =
  | "retirement" // 退休规划
  | "wealth_growth" // 财富增长
  | "house" // 购房
  | "education" // 教育
  | "risk_control"; // 风险控制

/** 资产分项（月收入之外的存量资产）。 */
export interface WealthAssets {
  /** 现金及活期/货币基金等流动现金。 */
  cash: number;
  /** 银行存款（定期 / 大额存单等）。 */
  deposits: number;
  /** 股票（A股/港股/美股等权益类）。 */
  stocks: number;
  /** 基金（公募/私募等）。 */
  funds: number;
  /** 债券（国债 / 企业债等固收类）。 */
  bonds: number;
  /** 房产（自住或投资房产估值）。 */
  realEstate: number;
  /** 其他资产（贵金属、数字资产、收藏等）。 */
  other: number;
}

/** 负债分项。 */
export interface WealthLiabilities {
  /** 房贷余额。 */
  mortgage: number;
  /** 车贷余额。 */
  carLoan: number;
  /** 信用贷 / 消费贷余额。 */
  creditLoan: number;
  /** 其他负债（消费贷 / 经营贷 / 信用卡、亲友借款等）。 */
  loans: number;
  /** 其他负债。 */
  other: number;
}

/** 财富目标。0 / 空串 = 用户未设定，不做任何默认填充。 */
export interface WealthGoals {
  /** 目标类型（可选）。 */
  type?: WealthGoalType;
  /** 目标退休年龄（0 = 未设定）。 */
  retirementAge: number;
  /** 目标金额（元，0 = 未设定）。 */
  targetAmount: number;
  /** 期望达成年限（年，0 = 未设定）。 */
  targetYears?: number;
  /** 人生目标描述（购房 / 创业 / 教育等自由文本，空 = 未填写）。 */
  lifeGoal: string;
}

/** 财富初始化画像（financial_profiles 记录）。 */
export interface WealthProfile {
  /** 记录 ID（生成，非 userId）。 */
  id: string;
  /** 所属用户 ID（同时作为存储分区键）。 */
  userId: string;
  name: string;
  age: number;
  /** 职业（可选）。 */
  occupation?: string;
  /** 城市（可选）。 */
  city?: string;
  /** 婚姻状态（可选）。 */
  maritalStatus?: MaritalStatus;
  /** 子女数量（可选，0 = 无）。 */
  children?: number;
  /** 家庭情况补充说明（可选）。 */
  familyNote?: string;
  /** 月收入（元）。 */
  income: number;
  /** 收入来源（多选，可空）。 */
  incomeSources?: IncomeSource[];
  /** 收入稳定性（可选）。 */
  incomeStability?: IncomeStability;
  /** 月支出（元，0 = 未填写）。 */
  expense: number;
  /** 月投资金额（元，0 = 未填写）。 */
  investment: number;
  assets: WealthAssets;
  liabilities: WealthLiabilities;
  goals: WealthGoals;
  /** 初始化是否完成（true = 已生成 Financial Twin）。 */
  completed: boolean;
  createdAt: number;
  updatedAt: number;
}

/** 汇总总资产（所有资产分项之和，纯计算，不伪造）。 */
export function sumAssets(a: WealthAssets): number {
  return (
    (a.cash || 0) +
    (a.deposits || 0) +
    (a.stocks || 0) +
    (a.funds || 0) +
    (a.bonds || 0) +
    (a.realEstate || 0) +
    (a.other || 0)
  );
}

/** 汇总总负债。 */
export function sumLiabilities(l: WealthLiabilities): number {
  return (
    (l.mortgage || 0) +
    (l.carLoan || 0) +
    (l.creditLoan || 0) +
    (l.loans || 0) +
    (l.other || 0)
  );
}
