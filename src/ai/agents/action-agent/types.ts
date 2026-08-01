// ── Phase 5：Action Agent（财富执行 Agent）类型 ──────────────────────────────
import type { TaskCategory } from "@/wealth/tasks";

/** 单条执行任务（Action Agent 拆产物，对应 spec 的 Action Plan JSON 结构）。 */
export interface ActionTaskItem {
  title: string;
  description: string;
  /** 截止日期 ISO（如 2026-08-24）。 */
  deadline?: string;
  priority: "high" | "medium" | "low";
  category: TaskCategory;
  /** spec 要求每条任务带 status。 */
  status: "pending";
}

/** Action Agent 产出的 Action Plan JSON（完全对应 spec 结构）。 */
export interface ActionPlanJSON {
  goal: string;
  priority: "high" | "medium" | "low";
  tasks: ActionTaskItem[];
}
