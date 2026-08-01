import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * AI 用量审计（Phase 5.9.1 / spec #9、#10）。
 *
 * 每次 LLM 调用（成功或失败）都会被记录到 `.data/ai-usage/{userId}.json`，
 * 包含 user_id / agent_name / model / token_usage / latency / cost / time，
 * 供「AI Usage Center」按用户聚合展示本月调用次数、Token 消耗与估算费用。
 *
 * 设计为「只追加、永不阻断主流程」：任何 I/O 失败都被吞掉，不影响 AI 分析。
 */

export interface UsageRecord {
  userId: string;
  /** 调用方智能体中文名（如「退休规划 Agent」）；非 Agent 直接调用时为 undefined。 */
  agentName?: string;
  provider: string;
  model: string;
  taskType?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  /** 估算费用（USD），基于参考单价；未知模型为 0（透明，不编造）。 */
  costUsd: number;
  success: boolean;
  /** 失败时记录的错误摘要。 */
  error?: string;
  timestamp: number;
}

export interface AgentUsage {
  calls: number;
  tokens: number;
  costUsd: number;
}

export interface UsageSummary {
  totalCalls: number;
  totalTokens: number;
  totalCostUsd: number;
  /** 自然月（自本月 1 日 00:00 起）聚合。 */
  monthCalls: number;
  monthTokens: number;
  monthCostUsd: number;
  /** 最近一次调用时间戳；无记录为 null。 */
  lastCallAt: number | null;
  byAgent: Record<string, AgentUsage>;
}

const BASE_DIR = path.join(process.cwd(), ".data", "ai-usage");
const MAX_RECORDS = 500;

function safeId(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
}

function fileFor(userId: string): string {
  return path.join(BASE_DIR, `${safeId(userId)}.json`);
}

/**
 * 每千 Token 参考单价（USD）。仅用于「估算费用」展示，非计费凭据。
 * 未列出的模型按 0 估算，避免编造价格。
 */
const PRICE_PER_1K: Record<string, { in: number; out: number }> = {
  "gpt-4o": { in: 0.005, out: 0.015 },
  "gpt-4o-mini": { in: 0.00015, out: 0.0006 },
  "deepseek-chat": { in: 0.00027, out: 0.0011 },
  "deepseek-reasoner": { in: 0.00055, out: 0.0022 },
  "claude-sonnet-4-20250514": { in: 0.003, out: 0.015 },
  "claude-3-5-sonnet": { in: 0.003, out: 0.015 },
  "qwen-vl-max": { in: 0.0008, out: 0.0008 },
  "gemini-1.5-pro": { in: 0.00125, out: 0.005 },
  "gemini-2.0-flash": { in: 0.0001, out: 0.0004 },
};

export function estimateCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): number {
  const p = PRICE_PER_1K[model];
  if (!p) return 0;
  return (promptTokens / 1000) * p.in + (completionTokens / 1000) * p.out;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 追加一条用量记录（异步、不阻塞主流程）。 */
export async function recordUsage(
  rec: Omit<UsageRecord, "costUsd" | "timestamp"> & { timestamp?: number; error?: string }
): Promise<void> {
  try {
    await fs.mkdir(BASE_DIR, { recursive: true });
    const file = fileFor(rec.userId);
    let arr: UsageRecord[] = [];
    try {
      const raw = await fs.readFile(file, "utf8");
      const parsed = JSON.parse(raw) as UsageRecord[];
      if (Array.isArray(parsed)) arr = parsed;
    } catch {
      arr = [];
    }
    const entry: UsageRecord = {
      userId: rec.userId,
      agentName: rec.agentName,
      provider: rec.provider,
      model: rec.model,
      taskType: rec.taskType,
      promptTokens: rec.promptTokens,
      completionTokens: rec.completionTokens,
      totalTokens: rec.totalTokens,
      latencyMs: rec.latencyMs,
      costUsd: round2(estimateCost(rec.model, rec.promptTokens, rec.completionTokens)),
      success: rec.success,
      error: rec.error,
      timestamp: rec.timestamp ?? Date.now(),
    };
    arr.push(entry);
    if (arr.length > MAX_RECORDS) arr = arr.slice(arr.length - MAX_RECORDS);
    await fs.writeFile(file, JSON.stringify(arr), "utf8");
  } catch {
    // 用量记录失败不影响主流程
  }
}

/** 读取某用户的用量聚合（无记录返回全零结构）。 */
export async function getUsage(userId: string): Promise<UsageSummary> {
  const empty: UsageSummary = {
    totalCalls: 0,
    totalTokens: 0,
    totalCostUsd: 0,
    monthCalls: 0,
    monthTokens: 0,
    monthCostUsd: 0,
    lastCallAt: null,
    byAgent: {},
  };
  try {
    const raw = await fs.readFile(fileFor(userId), "utf8");
    const arr = JSON.parse(raw) as UsageRecord[];
    if (!Array.isArray(arr) || arr.length === 0) return empty;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const summary: UsageSummary = { ...empty, byAgent: {} };

    for (const r of arr) {
      summary.totalCalls += 1;
      summary.totalTokens += r.totalTokens;
      summary.totalCostUsd += r.costUsd;
      if (r.timestamp >= monthStart) {
        summary.monthCalls += 1;
        summary.monthTokens += r.totalTokens;
        summary.monthCostUsd += r.costUsd;
      }
      const key = r.agentName ?? "其他调用";
      const a = (summary.byAgent[key] ??= { calls: 0, tokens: 0, costUsd: 0 });
      a.calls += 1;
      a.tokens += r.totalTokens;
      a.costUsd += r.costUsd;
      if (summary.lastCallAt === null || r.timestamp > summary.lastCallAt) {
        summary.lastCallAt = r.timestamp;
      }
    }

    summary.totalCostUsd = round2(summary.totalCostUsd);
    summary.monthCostUsd = round2(summary.monthCostUsd);
    for (const k of Object.keys(summary.byAgent)) {
      summary.byAgent[k].costUsd = round2(summary.byAgent[k].costUsd);
    }
    return summary;
  } catch {
    return empty;
  }
}
