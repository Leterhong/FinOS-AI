// ── Phase 5：Wealth Task System 类型定义 ──────────────────────────────────────
// 纯数据类型，客户端与服务端共享，不含任何实现。

/** 任务类型（对应财富执行维度）。 */
export type TaskCategory =
  | "wealth-growth" // 财富增长
  | "risk-reduction" // 风险降低
  | "investment-adjustment" // 投资调整
  | "cashflow-optimization" // 现金流优化
  | "retirement-prep" // 退休准备
  | "protection" // 保障配置
  | "review"; // 复盘检视

/** 任务状态。 */
export type WealthTaskStatus = "pending" | "in-progress" | "done" | "skipped";

/** 任务所属计划档位。 */
export type PlanHorizon = "short" | "medium" | "long";

/** 单条可执行财富任务（由 Action Agent 拆产生，存入 Task System）。 */
export interface WealthTask {
  id: string;
  userId: string;
  /** 关联目标（如 "50 岁退休"）。 */
  goal: string;
  category: TaskCategory;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  /** 截止日期 ISO（如 2026-08-24）。 */
  deadline?: string;
  status: WealthTaskStatus;
  /** 来源：action-agent / plan / copilot / chat。 */
  source: string;
  /** 所属计划档位。 */
  planHorizon?: PlanHorizon;
  createdAt: number;
  completedAt?: number;
}

/** 新建任务的输入（不含系统字段）。 */
export type WealthTaskInput = Omit<
  WealthTask,
  "id" | "userId" | "status" | "createdAt" | "completedAt"
> & { status?: WealthTaskStatus };

/** 单用户任务存储。 */
export interface TaskManagerState {
  userId: string;
  tasks: WealthTask[];
}
