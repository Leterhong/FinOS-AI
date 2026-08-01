import "server-only";

/**
 * Phase 6.8 Proactive Scheduler（需求七 / 十三）。
 * 沙箱内无常驻定时进程，采用「到期判定 + 惰性触发」模式：
 * 前端 / API 调用 getScheduleStatus 判断每日 / 每周任务是否到期，
 * 到期则触发 runProactiveMonitor（kind=daily|weekly），运行日志即调度水位。
 */

import { proactiveStore } from "./notification";
import type { ProactiveRunLog, ScheduleStatus } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function lastRunOf(
  logs: ProactiveRunLog[],
  kind: ProactiveRunLog["kind"]
): number | null {
  for (let i = logs.length - 1; i >= 0; i -= 1) {
    if (logs[i].kind === kind) return logs[i].runAt;
  }
  return null;
}

/** 查询调度状态（每日体检 / 每周报告是否到期）。 */
export function getScheduleStatus(userId: string): ScheduleStatus {
  const settings = proactiveStore.getSettings(userId);
  const logs = proactiveStore.listRunLogs(userId);
  const now = Date.now();

  const lastDailyRun = lastRunOf(logs, "daily");
  const lastWeeklyRun = lastRunOf(logs, "weekly");

  const active = settings.enabled && settings.frequency !== "off";
  const dueDaily =
    active &&
    settings.frequency === "daily" &&
    (lastDailyRun === null || now - lastDailyRun >= DAY_MS);
  const dueWeekly =
    active && (lastWeeklyRun === null || now - lastWeeklyRun >= WEEK_MS);

  return {
    frequency: settings.frequency,
    enabled: settings.enabled,
    lastDailyRun,
    lastWeeklyRun,
    dueDaily,
    dueWeekly,
  };
}

/** 每日体检是否到期。 */
export function shouldRunDaily(userId: string): boolean {
  return getScheduleStatus(userId).dueDaily;
}

/** 每周报告是否到期。 */
export function shouldRunWeekly(userId: string): boolean {
  return getScheduleStatus(userId).dueWeekly;
}
