import "server-only";

/**
 * Phase 6.8 Proactive Notification System（需求五 / 十一 / 十二 / 十四）。
 *
 *  - proactiveStore：通知 / 设置 / 运行日志持久化
 *      按 userId 分文件 .data/proactive/{userId}.json（AES-256-GCM 加密），
 *      所有通知强制绑定 user_id，用户间完全隔离（需求十四）。
 *  - applyNotificationPolicy：避免骚扰策略
 *      总开关关闭全部拦截（验收测试 4）/ 关注领域过滤 /
 *      低价值（low 优先级）抑制 / 同类事件 24 小时内不重复提醒。
 *  - buildNotificationsFromEvents：事件 → 结构化通知
 *      结构：标题 / 等级 / 原因 / 建议 / 时间（需求五）。
 */

import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { encryptToFileString, parseSecureFileString } from "@/security";
import type { FinancialProfile } from "@/data/types";
import type { TwinSnapshot } from "@/twin/engine";
import type { FinancialAlert, WealthNotification } from "@/ai/monitoring/types";
import { generateNotifications } from "@/ai/monitoring/notification";
import {
  DEFAULT_PROACTIVE_SETTINGS,
  type ProactiveNotification,
  type ProactiveRunLog,
  type ProactiveSettings,
} from "./types";

// ── 持久化 ────────────────────────────────────────────────────────────────

const BASE_DIR = path.join(process.cwd(), ".data", "proactive");
/** 通知最多保留条数（防止无限增长）。 */
const MAX_NOTIFICATIONS = 200;
/** 运行日志最多保留条数（趋势检测 + 调度判断足够）。 */
const MAX_RUN_LOGS = 60;
/** 同类事件去重窗口：24 小时。 */
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

interface ProactiveState {
  notifications: ProactiveNotification[];
  settings: ProactiveSettings;
  runLogs: ProactiveRunLog[];
}

function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function fileOf(userId: string): string {
  return path.join(BASE_DIR, `${sanitize(userId)}.json`);
}

function emptyState(): ProactiveState {
  return {
    notifications: [],
    settings: { ...DEFAULT_PROACTIVE_SETTINGS },
    runLogs: [],
  };
}

function readState(userId: string): ProactiveState {
  try {
    const fp = fileOf(userId);
    if (!fs.existsSync(fp)) return emptyState();
    const parsed = parseSecureFileString<ProactiveState>(
      fs.readFileSync(fp, "utf-8")
    );
    const v = parsed?.value;
    if (!v || typeof v !== "object") return emptyState();
    return {
      notifications: Array.isArray(v.notifications) ? v.notifications : [],
      settings: {
        ...DEFAULT_PROACTIVE_SETTINGS,
        ...(v.settings ?? {}),
      },
      runLogs: Array.isArray(v.runLogs) ? v.runLogs : [],
    };
  } catch {
    return emptyState();
  }
}

function writeState(userId: string, state: ProactiveState): void {
  if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
  fs.writeFileSync(fileOf(userId), encryptToFileString(state), "utf-8");
}

/** 生成通知 id。 */
export function newNotificationId(): string {
  return `pntf-${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
}

class ProactiveStore {
  // ── 通知 ──
  listNotifications(userId: string): ProactiveNotification[] {
    return readState(userId)
      .notifications.filter((n) => !n.dismissed)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  unreadCount(userId: string): number {
    return readState(userId).notifications.filter(
      (n) => !n.read && !n.dismissed
    ).length;
  }

  addNotifications(
    userId: string,
    items: ProactiveNotification[]
  ): ProactiveNotification[] {
    if (items.length === 0) return [];
    const state = readState(userId);
    const bound = items.map((n) => ({ ...n, userId: sanitize(userId) }));
    state.notifications = [...bound, ...state.notifications].slice(
      0,
      MAX_NOTIFICATIONS
    );
    writeState(userId, state);
    return bound;
  }

  /** 更新单条通知（已读 / 忽略）。 */
  updateNotification(
    userId: string,
    id: string,
    patch: Partial<Pick<ProactiveNotification, "read" | "dismissed">>
  ): ProactiveNotification | null {
    const state = readState(userId);
    const idx = state.notifications.findIndex((n) => n.id === id);
    if (idx < 0) return null;
    state.notifications[idx] = { ...state.notifications[idx], ...patch };
    writeState(userId, state);
    return state.notifications[idx];
  }

  markAllRead(userId: string): number {
    const state = readState(userId);
    let count = 0;
    state.notifications = state.notifications.map((n) => {
      if (!n.read) count += 1;
      return { ...n, read: true };
    });
    if (count > 0) writeState(userId, state);
    return count;
  }

  /** 24h 去重判断：同 eventType（或同标题）在窗口内已存在。 */
  hasRecentSimilar(
    userId: string,
    item: Pick<ProactiveNotification, "eventType" | "title">,
    now = Date.now()
  ): boolean {
    const state = readState(userId);
    return state.notifications.some((n) => {
      if (now - n.createdAt > DEDUPE_WINDOW_MS) return false;
      if (item.eventType && n.eventType) return n.eventType === item.eventType;
      return n.title === item.title;
    });
  }

  // ── 设置 ──
  getSettings(userId: string): ProactiveSettings {
    return readState(userId).settings;
  }

  saveSettings(
    userId: string,
    patch: Partial<ProactiveSettings>
  ): ProactiveSettings {
    const state = readState(userId);
    state.settings = {
      ...state.settings,
      ...patch,
      updatedAt: Date.now(),
    };
    writeState(userId, state);
    return state.settings;
  }

  // ── 运行日志（兼作历史快照，用于趋势检测与调度） ──
  listRunLogs(userId: string): ProactiveRunLog[] {
    return readState(userId).runLogs;
  }

  addRunLog(userId: string, log: ProactiveRunLog): void {
    const state = readState(userId);
    state.runLogs = [...state.runLogs, log].slice(-MAX_RUN_LOGS);
    writeState(userId, state);
  }

  /** 清空用户全部主动数据（删除账户时）。 */
  clear(userId: string): void {
    try {
      const fp = fileOf(userId);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch {
      /* 容错 */
    }
  }
}

export const proactiveStore = new ProactiveStore();

// ── 事件 → 结构化通知 ─────────────────────────────────────────────────────

/**
 * 把 alert.message 按「。建议 / 。可 / 。注意」等提示词拆为「原因 + 建议」。
 * 找不到分割点时整段作为原因，建议给出通用兜底。
 */
function splitReasonSuggestion(message: string): {
  reason: string;
  suggestion: string;
} {
  const markers = ["建议", "可适当", "可考虑", "注意", "请"];
  const sentences = message.split(/(?<=。)/);
  const idx = sentences.findIndex((s) =>
    markers.some((m) => s.trimStart().startsWith(m))
  );
  if (idx > 0) {
    return {
      reason: sentences.slice(0, idx).join("").trim(),
      suggestion: sentences.slice(idx).join("").trim(),
    };
  }
  return { reason: message, suggestion: "建议在财富监控中心查看详情并复核。" };
}

/**
 * 事件 → 主动通知（结构：标题 / 等级 / 原因 / 建议 / 时间）。
 * 复用 monitoring 层的类别 / 优先级映射与机会提醒。
 */
export function buildNotificationsFromEvents(
  userId: string,
  profile: FinancialProfile,
  twin: TwinSnapshot,
  alerts: FinancialAlert[],
  source: ProactiveNotification["source"] = "monitor"
): ProactiveNotification[] {
  const base: WealthNotification[] = generateNotifications(
    profile,
    twin,
    alerts
  );
  const now = Date.now();
  return base.map((n) => {
    const alert = alerts.find((a) => a.id === n.relatedAlertId);
    const { reason, suggestion } = splitReasonSuggestion(n.message);
    return {
      id: newNotificationId(),
      userId,
      category: n.category,
      priority: n.priority,
      severity: alert?.severity ?? "info",
      title: n.title,
      reason,
      suggestion,
      eventType: alert?.type,
      source,
      read: false,
      dismissed: false,
      createdAt: now,
    };
  });
}

// ── Notification Policy（需求十一 / 十二） ────────────────────────────────

export interface PolicyResult {
  accepted: ProactiveNotification[];
  suppressed: number;
}

/**
 * 避免骚扰策略：
 *  1. enabled=false → 全部拦截（验收测试 4）；
 *  2. 类别不在 focusAreas → 拦截；
 *  3. low 优先级且 suppressLowPriority → 拦截；
 *  4. 同类事件 24h 内已提醒过 → 拦截（含本批内部去重）。
 */
export function applyNotificationPolicy(
  userId: string,
  settings: ProactiveSettings,
  candidates: ProactiveNotification[]
): PolicyResult {
  if (!settings.enabled) {
    return { accepted: [], suppressed: candidates.length };
  }
  const accepted: ProactiveNotification[] = [];
  let suppressed = 0;
  const seenInBatch = new Set<string>();
  const now = Date.now();

  for (const n of candidates) {
    if (!settings.focusAreas.includes(n.category)) {
      suppressed += 1;
      continue;
    }
    if (settings.suppressLowPriority && n.priority === "low") {
      suppressed += 1;
      continue;
    }
    const key = n.eventType ?? n.title;
    if (seenInBatch.has(key)) {
      suppressed += 1;
      continue;
    }
    if (proactiveStore.hasRecentSimilar(userId, n, now)) {
      suppressed += 1;
      continue;
    }
    seenInBatch.add(key);
    accepted.push(n);
  }
  return { accepted, suppressed };
}
