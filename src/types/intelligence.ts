// Phase 7.1 Wealth Intelligence 后端响应类型（与 backend/intelligence 各引擎返回对齐）

export interface WealthContextDict {
  hasData: boolean;
  age: number | null;
  riskLevel: string;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  monthlyIncome: number;
  monthlyExpense: number;
  monthlySurplus: number;
  savingsRate: number;
  cash: number;
  emergencyMonths: number | null;
  investmentRatio: number;
  protectionAmount: number;
  debtRatio: number;
  allocation: Record<string, number>;
  goal: string | null;
  goalAmount: number | null;
  assumedAnnualReturn: number;
}

export interface WealthDimension {
  key: string;
  label: string;
  score: number;
  weight: number;
  level: string;
  reasons: string[];
}

export interface WealthScore {
  hasData: boolean;
  totalScore: number;
  level: string;
  dimensions: WealthDimension[];
  weakest: { key: string; label: string; score: number };
  strongest: { key: string; label: string; score: number };
  method?: string;
  disclaimer?: string;
  message?: string;
}

export interface WealthMilestone {
  year: number;
  netWorth: number;
  totalAssets: number;
  annualSaving: number;
}

export interface WealthTimelineStage {
  stage: string;
  yearOffset: number;
  age: number | null;
  netWorth: number;
  description: string;
  required?: number;
  gap?: number;
}

export interface RetirementResult {
  available: boolean;
  currentAge?: number;
  retirementAge?: number;
  yearsToRetirement?: number;
  annualExpenseAtRetirement?: number;
  requiredCapital?: number;
  projectedCapital?: number;
  gap?: number;
  covered?: boolean;
  extraMonthlySavingNeeded?: number;
  reason?: string;
}

export interface GoalResult {
  available: boolean;
  targetAmount?: number;
  horizonYears?: number;
  probability?: number;
  probabilityLabel?: string;
  reason?: string;
}

export interface CashflowSeriesPoint {
  year: number;
  income: number;
  expense: number;
  surplus: number;
}

export interface CashflowResult {
  series: CashflowSeriesPoint[];
  currentMonthlySurplus: number;
  breakEvenYear: number | null;
  note: string;
}

export interface AssumptionBlock {
  annualReturn?: number;
  inflation?: number;
  salaryGrowth?: number;
  withdrawRate?: number;
  volatility?: number;
  retirementAge?: number;
  model?: string;
  [key: string]: unknown;
}

export interface WealthSeriesPoint {
  year: number;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  annualIncome: number;
  annualExpense: number;
  annualSaving: number;
}

export interface WealthPredict {
  hasData: boolean;
  current?: WealthContextDict;
  milestones: WealthMilestone[];
  series: WealthSeriesPoint[];
  cashflow: CashflowResult;
  retirement: RetirementResult;
  goal: GoalResult;
  timeline: WealthTimelineStage[];
  assumptions: AssumptionBlock;
  disclaimer: string;
  message?: string;
  cached?: boolean;
}

export interface CatalogEventParam {
  key: string;
  label: string;
  type: "number" | "ratio";
  default: number;
}

export interface CatalogEvent {
  type: string;
  label: string;
  params: CatalogEventParam[];
}

export interface Explanation {
  title?: string;
  cause: string[];
  impact: string[];
  advice: string[];
  tier?: string;
  aiText?: string;
  text?: string;
}

export interface WealthSnapshot {
  netWorth: number;
  monthlySurplus: number;
  savingsRate: number;
  emergencyMonths: number | null;
  debtRatio: number;
  netWorth1y?: number | null;
  netWorth5y?: number | null;
  netWorth10y?: number | null;
  healthScore?: number | null;
  dimensions?: WealthDimension[];
  goalProbability?: number | null;
  retirementGap?: number | null;
  timeline?: WealthTimelineStage[];
  assumptions?: AssumptionBlock;
}

export type ImpactMap = Record<string, { before: number; after: number; delta: number }>;

export interface SimulateResult {
  hasData: boolean;
  eventType: string;
  eventLabel: string;
  params: Record<string, number>;
  baseline: WealthSnapshot;
  scenario: WealthSnapshot;
  impact: ImpactMap;
  explanation: Explanation;
  assumptions: AssumptionBlock;
  disclaimer: string;
  simulationId?: string;
  message?: string;
}

export interface PlanResult {
  key: string;
  label: string;
  events: { type: string; detail: Record<string, number> }[];
  snapshot: WealthSnapshot;
  impact: ImpactMap;
  explanation: Explanation;
}

export interface CompareResult {
  hasData: boolean;
  baseline: WealthSnapshot;
  plans: PlanResult[];
  recommended: { key: string; label: string; reason: string };
  ranking: { key: string; score: number }[];
  disclaimer: string;
}

export interface WorkflowFinding {
  agent: string;
  label: string;
  score?: number | null;
  explanation: Explanation;
  data?: Record<string, unknown>;
  error?: string;
}

/** 单条策略动作，对应后端 strategies.horizons[].actions[] */
export interface WorkflowStrategyAction {
  title: string;
  detail: string;
  priority: "low" | "medium" | "high" | string;
}

/** 策略时间维度，对应后端 strategies.horizons[] */
export interface WorkflowStrategyHorizon {
  key: string;
  label: string;
  actions: WorkflowStrategyAction[];
}

export interface WorkflowStrategies {
  hasData: boolean;
  horizons: WorkflowStrategyHorizon[];
  explanation?: Explanation;
}

export interface WorkflowTraceStep {
  step: number;
  agent: string;
  label: string;
  action?: string;
  agents?: string[];
  completed?: string[];
  tier?: string;
}

export interface WorkflowResult {
  hasData: boolean;
  question?: string;
  score: WealthScore;
  prediction: {
    milestones: WealthMilestone[];
    timeline: WealthTimelineStage[];
    retirement: RetirementResult;
    goal: GoalResult;
    cashflow: CashflowResult;
    assumptions: AssumptionBlock;
  };
  findings: WorkflowFinding[];
  strategies: WorkflowStrategies;
  summary: Explanation;
  memoryUsed: boolean;
  trace: WorkflowTraceStep[];
  elapsedMs: number;
  disclaimer: string;
}

export interface WealthMemoryItem {
  id: string;
  kind: string;
  key: string;
  content: string;
  importance: number;
  hitCount: number;
  createdAt: string;
  updatedAt: string;
}
