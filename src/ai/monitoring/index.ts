// Phase 4：Autonomous AI Wealth Manager 模块出口。
export * from "./types";
export { detectFinancialEvents } from "./detector";
export type { DetectOptions } from "./detector";
export { computeGoalProgress } from "./goals";
export { generateActionPlan } from "./action-plan";
export { generateNotifications } from "./notification";
export { generateBriefing } from "./advisor";
export { runMonitoring } from "./monitor";
export type { MonitorInput, MonitorOutput } from "./monitor";
