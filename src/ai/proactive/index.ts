/**
 * Phase 6.8 Proactive AI CFO —— 模块出口。
 * 注意：types.ts 为纯类型可在客户端引用；其余实现均为 server-only。
 */

export * from "./types";
export { detectProactiveEvents } from "./event-detector";
export type { ProactiveDetectOptions } from "./event-detector";
export { generateProactiveAdvice, localAdvice, tierOf } from "./advisor";
export {
  proactiveStore,
  applyNotificationPolicy,
  buildNotificationsFromEvents,
  newNotificationId,
} from "./notification";
export { runProactiveMonitor } from "./monitor";
export type { ProactiveMonitorInput } from "./monitor";
export {
  getScheduleStatus,
  shouldRunDaily,
  shouldRunWeekly,
} from "./scheduler";
export { buildDailyBrief, buildWeeklyReport } from "./report";
export { simulateLifeEvent, LIFE_EVENT_LABELS } from "./life-event";
