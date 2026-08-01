export interface FinancialProfile {
  name: string;
  age: number;
  monthlySalary: number;
  totalAssets: number;
  liabilities: number;
  monthlyExpenses: number;
  monthlyInvestment: number;
  cashSavings: number;
  stockPortfolio: number;
  realEstate: number;
  bonds: number;
  crypto: number;
  funds: number;
  insurance: number;
  house: number;
  riskLevel: "conservative" | "moderate" | "aggressive";
  goal: {
    retirementAge: number;
    targetAmount: number;
  };
  // Accumulated event modifiers (applied on top of base profile)
  modifiers: {
    extraExpense: number;
    extraIncome: number;
    extraInvestment: number;
    extraReturn: number;
  };
  // ── Phase 3.5 用户画像扩展（可选，保持向后兼容） ──
  /** 职业（如 工程师 / 创业者 / 教师）。 */
  occupation?: string;
  /** 家庭状况。 */
  familyStatus?: "single" | "married" | "family" | "other";
  /** 受抚养人数（子女/老人）。 */
  dependents?: number;
  /** 人生目标清单（买房 / 创业 / 教育 / 退休等）。 */
  goals?: LifeGoal[];
  /** 投资经验：无 / 一些 / 丰富。 */
  riskExperience?: "none" | "some" | "experienced";
  /** 主观风险偏好。 */
  riskTolerance?: "low" | "medium" | "high";
  /** 客观风险承受能力（由资产/负债/现金流推导）。 */
  riskCapacity?: "low" | "medium" | "high";
}

/**
 * 空财富画像（EMPTY_PROFILE）。
 * 真实用户尚未创建任何财富数据时使用的中性占位——绝不含任何虚构人物数据
 * （无默认资产 / 默认收入 / 默认退休目标 / 默认现金流）。
 * 仅用于类型安全与「无数据」语义判断；一旦加载真实画像即被替换。
 */
export const EMPTY_PROFILE: FinancialProfile = {
  name: "",
  age: 0,
  monthlySalary: 0,
  totalAssets: 0,
  liabilities: 0,
  monthlyExpenses: 0,
  monthlyInvestment: 0,
  cashSavings: 0,
  stockPortfolio: 0,
  realEstate: 0,
  bonds: 0,
  crypto: 0,
  funds: 0,
  insurance: 0,
  house: 0,
  riskLevel: "moderate",
  goal: {
    retirementAge: 0,
    targetAmount: 0,
  },
  modifiers: {
    extraExpense: 0,
    extraIncome: 0,
    extraInvestment: 0,
    extraReturn: 0,
  },
};

/**
 * 判定画像是否为「空」（无任何真实财富数据）。
 * 真实用户画像必然至少含收入、资产或负债之一；三者皆为零即视为空。
 */
export function isEmptyProfile(p: FinancialProfile | null | undefined): boolean {
  if (!p) return true;
  const hasAssets =
    p.totalAssets > 0 ||
    p.cashSavings > 0 ||
    p.stockPortfolio > 0 ||
    p.realEstate > 0 ||
    p.bonds > 0 ||
    p.crypto > 0 ||
    p.funds > 0 ||
    p.house > 0 ||
    p.insurance > 0;
  const hasIncome = p.monthlySalary > 0 || p.monthlyInvestment > 0;
  const hasLiabilities = p.liabilities > 0;
  return !hasAssets && !hasIncome && !hasLiabilities;
}

/**
 * 规范化财富画像：以 EMPTY_PROFILE 为基底补全缺失字段，并对嵌套对象
 * goal / modifiers 做深合并。用于修复「旧 schema 画像（缺 goal / modifiers
 * 等字段）加载后，前端直接读取 profile.goal.retirementAge 等子字段得到
 * undefined，触发客户端异常（Cannot read properties of undefined）」的类问题。
 * 对已完整的画像为幂等（仅覆盖缺省值），不影响正常数据。
 */
export function normalizeProfile(
  p: Partial<FinancialProfile> | null | undefined
): FinancialProfile {
  if (!p) return { ...EMPTY_PROFILE };
  return {
    ...EMPTY_PROFILE,
    ...p,
    goal: { ...EMPTY_PROFILE.goal, ...(p.goal ?? {}) },
    modifiers: { ...EMPTY_PROFILE.modifiers, ...(p.modifiers ?? {}) },
  };
}

/** 人生目标（Phase 3.5 用户画像系统）。 */
export interface LifeGoal {
  id: string;
  type: "buy-house" | "start-business" | "education" | "retirement" | "wealth-growth" | "other";
  label: string;
  /** 目标达成年份（如 2030）。 */
  targetYear?: number;
  /** 目标金额（如首付、教育金）。 */
  targetAmount?: number;
  /** 距今年数（用于时间线展示）。 */
  horizonYears?: number;
  priority: "high" | "medium" | "low";
  status: "active" | "achieved" | "paused";
}

export interface CashFlow {
  income: number;
  expenses: number;
  savings: number;
  savingsRate: number;
}

export interface RiskMetrics {
  debtRisk: number;
  investmentRisk: number;
  cashFlowRisk: number;
  overall: number;
}

export interface ProjectionPoint {
  age: number;
  year: number;
  assets: number;
  label?: string;
}

export interface MonthlyTrend {
  month: string;
  income: number;
  expenses: number;
}

export interface AssetClass {
  name: string;
  value: number;
  color: string;
}

export interface ScenarioDefinition {
  id: string;
  label: string;
  icon: string;
  description: string;
  mutate: (profile: FinancialProfile) => Partial<FinancialProfile> & {
    extraExpense?: number;
    extraIncome?: number;
    extraInvestment?: number;
    extraReturn?: number;
  };
  plannerHint: string;
}

export type AgentKey =
  | "planner"
  | "cashflow"
  | "investment"
  | "risk"
  | "retirement"
  | "strategy"
  | "summary";

export interface AgentResult {
  agent: AgentKey;
  status: "idle" | "thinking" | "done";
  summary: string;
  data?: unknown;
}

export interface PlannerTask {
  id: string;
  description: string;
  agent: AgentKey;
  status: "pending" | "running" | "done";
}

export type WorkflowPhase =
  | "idle"
  | "planning"
  | "analyzing"
  | "summarizing"
  | "complete";

export interface WorkflowState {
  phase: WorkflowPhase;
  tasks: PlannerTask[];
  agentStates: AgentResult[];
  results: import("@/agents/types").AgentAnalysis[];
  currentQuestion: string;
  summary?: import("@/agents/types").AgentAnalysis;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  agentSteps?: AgentResult[];
  analyses?: import("@/agents/types").AgentAnalysis[];
  isStreaming?: boolean;
  timestamp: number;
}
