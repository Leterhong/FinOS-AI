import type { AgentAnalysisOutput } from "../types";

/** 长期记忆分类（Phase 3.5）。 */
export type MemoryCategory = "profile" | "goal" | "financial" | "decision";

/** 1. 用户基本信息记忆。 */
export interface ProfileMemoryEntry {
  id: string;
  timestamp: number;
  /** 关键信息摘要（如 "32岁 工程师 风险偏好高"）。 */
  note: string;
  name?: string;
  age?: number;
  occupation?: string;
  familyStatus?: string;
  riskLevel?: string;
}

/** 2. 人生目标记忆。 */
export interface GoalMemoryEntry {
  id: string;
  timestamp: number;
  goalType: string;
  label: string;
  targetYear?: number;
  targetAmount?: number;
  status?: string;
  note: string;
}

/** 3. 资产变化记忆。 */
export interface FinancialMemoryEntry {
  id: string;
  timestamp: number;
  /** 资产变化说明（如 "创业支出 20 万，现金下降"）。 */
  changeNote: string;
  totalAssets?: number;
  netWorth?: number;
  monthlySalary?: number;
  liabilities?: number;
}

/** 4. 历史 AI 建议（决策）记忆。 */
export interface DecisionMemoryEntry {
  id: string;
  timestamp: number;
  question: string;
  /** AI 给出的建议 / 结论。 */
  recommendation: string;
  agent?: string;
  outcome?: string;
}

/** 5. 执行记忆（Phase 5 九）：记录用户执行能力与计划效果，用于未来建议优化。 */
export type ExecutionMemoryKind =
  | "task-completed" // 用户完成任务
  | "habit-change" // 用户习惯变化
  | "execution-ability" // 用户执行能力（如完成率）
  | "plan-effect"; // 历史计划效果

export interface ExecutionMemoryEntry {
  id: string;
  timestamp: number;
  kind: ExecutionMemoryKind;
  /** 记录摘要。 */
  note: string;
  /** 关联任务 id（task-completed 时）。 */
  taskId?: string;
  /** 关联目标类型（如 retirement）。 */
  goalType?: string;
  /** 结果 / 效果说明。 */
  outcome?: string;
}

/** 单用户完整记忆存储（按 userId 隔离）。 */
export interface UserMemoryStore {
  userId: string;
  profile: ProfileMemoryEntry[];
  goal: GoalMemoryEntry[];
  financial: FinancialMemoryEntry[];
  decision: DecisionMemoryEntry[];
  /** 执行记忆（Phase 5）：用户完成任务 / 习惯变化 / 执行能力 / 计划效果。 */
  execution: ExecutionMemoryEntry[];
  /** 用户偏好（如风险偏好、关注点等），兼容旧接口。 */
  preferences?: Record<string, unknown>;
}

/** 注入到 FinancialContext 的轻量历史摘要（兼容旧接口）。 */
export interface HistoryItem {
  goals: string[];
  summary?: string;
  summaryAt?: number;
  decisions?: string[];
}

/** 兼容旧 saveMemory 调用的扁平会话条目。 */
export interface LegacyMemoryEntry {
  id?: string;
  timestamp?: number;
  question: string;
  goals: string[];
  results: AgentAnalysisOutput[];
  summary?: AgentAnalysisOutput;
  strategy?: AgentAnalysisOutput;
  preferences?: Record<string, unknown>;
}
