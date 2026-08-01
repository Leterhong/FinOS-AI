import "server-only";

import fs from "node:fs";
import path from "node:path";
import type { AgentAnalysisOutput } from "../types";
import type {
  UserMemoryStore,
  ProfileMemoryEntry,
  GoalMemoryEntry,
  FinancialMemoryEntry,
  DecisionMemoryEntry,
  ExecutionMemoryEntry,
  ExecutionMemoryKind,
  HistoryItem,
  LegacyMemoryEntry,
} from "./types";

const DATA_DIR = path.join(process.cwd(), ".data", "memory");
const MAX_PER_CAT = 50;
const DEFAULT_USER = "default-user";

function sid(): string {
  return `mem-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`;
}
function sanitize(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || DEFAULT_USER;
}

/**
 * 长期金融记忆（Phase 3.5）：
 *  - 四类记忆：Profile（基本信息）/ Goal（人生目标）/ Financial（资产变化）/ Decision（历史 AI 建议）；
 *  - 严格按 userId 隔离，每用户独立文件，禁止数据混用；
 *  - 所有 IO 容错；持久化失败不影响当次会话。
 */
class FinancialMemory {
  private empty(userId: string): UserMemoryStore {
    return { userId, profile: [], goal: [], financial: [], decision: [], execution: [], preferences: {} };
  }

  private fileOf(userId: string): string {
    return path.join(DATA_DIR, `${sanitize(userId)}.json`);
  }

  private load(userId: string): UserMemoryStore {
    try {
      const fp = this.fileOf(userId);
      if (fs.existsSync(fp)) {
        const parsed = JSON.parse(fs.readFileSync(fp, "utf-8")) as UserMemoryStore;
        if (parsed && parsed.userId) {
          return {
            ...this.empty(userId),
            ...parsed,
            profile: parsed.profile ?? [],
            goal: parsed.goal ?? [],
            financial: parsed.financial ?? [],
            decision: parsed.decision ?? [],
            execution: parsed.execution ?? [],
          };
        }
      }
    } catch {
      /* 损坏文件：从空开始 */
    }
    return this.empty(userId);
  }

  private persist(userId: string, store: UserMemoryStore): void {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(this.fileOf(userId), JSON.stringify(store), "utf-8");
    } catch {
      /* 持久化失败不影响本次会话 */
    }
  }

  private push<T extends { id: string }>(arr: T[], e: T, max = MAX_PER_CAT): T[] {
    const next = [e, ...arr];
    if (next.length > max) next.length = max;
    return next;
  }

  // ── 四类写入 ──────────────────────────────────────────────────────────────
  addProfileMemory(
    userId: string,
    e: Omit<ProfileMemoryEntry, "id" | "timestamp">
  ): ProfileMemoryEntry {
    const full: ProfileMemoryEntry = { ...e, id: sid(), timestamp: Date.now() };
    const store = this.load(userId);
    store.profile = this.push(store.profile, full);
    this.persist(userId, store);
    return full;
  }

  addGoalMemory(
    userId: string,
    e: Omit<GoalMemoryEntry, "id" | "timestamp">
  ): GoalMemoryEntry {
    const store = this.load(userId);
    const idx = store.goal.findIndex((g) => g.goalType === e.goalType);
    const full: GoalMemoryEntry = {
      ...e,
      id: idx >= 0 ? store.goal[idx].id : sid(),
      timestamp: Date.now(),
    };
    if (idx >= 0) store.goal[idx] = full;
    else store.goal = this.push(store.goal, full);
    this.persist(userId, store);
    return full;
  }

  addFinancialMemory(
    userId: string,
    e: Omit<FinancialMemoryEntry, "id" | "timestamp">
  ): FinancialMemoryEntry {
    const full: FinancialMemoryEntry = { ...e, id: sid(), timestamp: Date.now() };
    const store = this.load(userId);
    store.financial = this.push(store.financial, full);
    this.persist(userId, store);
    return full;
  }

  addDecisionMemory(
    userId: string,
    e: Omit<DecisionMemoryEntry, "id" | "timestamp">
  ): DecisionMemoryEntry {
    const full: DecisionMemoryEntry = { ...e, id: sid(), timestamp: Date.now() };
    const store = this.load(userId);
    store.decision = this.push(store.decision, full);
    this.persist(userId, store);
    return full;
  }

  // ── 执行记忆（Phase 5 九）─────────────────────────────────────────────────
  addExecutionMemory(
    userId: string,
    e: Omit<ExecutionMemoryEntry, "id" | "timestamp">
  ): ExecutionMemoryEntry {
    const full: ExecutionMemoryEntry = { ...e, id: sid(), timestamp: Date.now() };
    const store = this.load(userId);
    store.execution = this.push(store.execution, full);
    this.persist(userId, store);
    return full;
  }

  /** 读取执行记忆（用于 Copilot 优化未来建议）。 */
  getExecutionHistory(userId: string = DEFAULT_USER): ExecutionMemoryEntry[] {
    return this.load(userId).execution;
  }

  /**
   * 汇总执行能力指标（完成率 / 习惯变化数 / 计划效果），供 Copilot 与 UI 展示。
   */
  getExecutionStats(userId: string = DEFAULT_USER): {
    total: number;
    completed: number;
    completionRate: number;
    habitChanges: number;
    planEffects: number;
  } {
    const items = this.getExecutionHistory(userId);
    const completed = items.filter((i) => i.kind === "task-completed").length;
    const habitChanges = items.filter((i) => i.kind === "habit-change").length;
    const planEffects = items.filter((i) => i.kind === "plan-effect").length;
    const total = items.length;
    return {
      total,
      completed,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      habitChanges,
      planEffects,
    };
  }

  // ── 读取 ──────────────────────────────────────────────────────────────────
  getMemory(userId: string): UserMemoryStore {
    return this.load(userId);
  }

  /** 兼容旧接口的轻量历史摘要，用于注入 FinancialContext。 */
  getHistory(userId: string = DEFAULT_USER): HistoryItem[] {
    const store = this.load(userId);
    const goals: HistoryItem[] = store.goal.map((g) => ({
      goals: [g.label],
      summary: g.note,
      summaryAt: g.timestamp,
    }));
    const decisions: HistoryItem[] = store.decision.slice(0, 5).map((d) => ({
      goals: [],
      summary: d.recommendation.slice(0, 80),
      summaryAt: d.timestamp,
      decisions: [d.recommendation.slice(0, 60)],
    }));
    return [...goals, ...decisions];
  }

  getLatestStrategy(userId: string = DEFAULT_USER): AgentAnalysisOutput | undefined {
    const store = this.load(userId);
    const s = store.decision.find((d) => d.agent === "strategy") ?? store.decision[0];
    if (!s) return undefined;
    return {
      agentId: s.agent ?? "strategy",
      headline: s.recommendation,
      bullets: [],
      metrics: [],
      confidence: 0.7,
    } as AgentAnalysisOutput;
  }

  /** 兼容旧调用：把一次分析会话拆分为 goal + decision 记忆。 */
  saveMemory(entry: LegacyMemoryEntry, userId: string = DEFAULT_USER): void {
    const store = this.load(userId);
    const ts = entry.timestamp ?? Date.now();
    for (const g of entry.goals) {
      store.goal = this.push(store.goal, {
        id: sid(),
        timestamp: ts,
        goalType: g,
        label: g,
        note: g,
      });
    }
    const rec =
      entry.summary?.headline ??
      entry.strategy?.headline ??
      "已完成一次财富分析";
    store.decision = this.push(store.decision, {
      id: sid(),
      timestamp: ts,
      question: entry.question,
      recommendation: rec,
      agent: entry.strategy ? "strategy" : "analysis",
    });
    if (entry.preferences) store.preferences = { ...store.preferences, ...entry.preferences };
    this.persist(userId, store);
  }

  setPreference(userId: string, key: string, value: unknown): void {
    const store = this.load(userId);
    store.preferences = { ...store.preferences, [key]: value };
    this.persist(userId, store);
  }

  getPreference<T = unknown>(userId: string, key: string): T | undefined {
    return this.load(userId).preferences?.[key] as T | undefined;
  }
}

export const agentMemory = new FinancialMemory();
