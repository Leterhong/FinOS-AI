/**
 * Cost Manager（Phase 6.5 二 / 十 / 十一）—— Token 成本与用户额度。
 *
 * - 复用 `usage-tracker` 的费用估算与用量聚合；
 * - 提供用户可配置的每日调用次数 / 每月 Token 额度；
 * - `checkBudget` 在真正调用 LLM 前拦截超限请求，返回友好提示。
 */
import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { getUsage, estimateCost, type UsageSummary, type UsageRecord } from "@/ai/usage/usage-tracker";
import type { AIQuota } from "./types";

const QUOTA_DIR = path.join(process.cwd(), ".data", "ai-quota");
const USAGE_DIR = path.join(process.cwd(), ".data", "ai-usage");

const DEFAULT_QUOTA: AIQuota = { dailyCalls: 50, monthlyTokens: 2_000_000 };

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
}
function quotaFile(userId: string): string {
  return path.join(QUOTA_DIR, `${safeId(userId)}.json`);
}
function usageFile(userId: string): string {
  return path.join(USAGE_DIR, `${safeId(userId)}.json`);
}

export { estimateCost };

export async function getQuota(userId: string): Promise<AIQuota> {
  try {
    const raw = await fs.readFile(quotaFile(userId), "utf8");
    const p = JSON.parse(raw) as Partial<AIQuota>;
    return {
      dailyCalls: p.dailyCalls ?? DEFAULT_QUOTA.dailyCalls,
      monthlyTokens: p.monthlyTokens ?? DEFAULT_QUOTA.monthlyTokens,
    };
  } catch {
    return { ...DEFAULT_QUOTA };
  }
}

export async function setQuota(userId: string, q: Partial<AIQuota>): Promise<AIQuota> {
  await fs.mkdir(QUOTA_DIR, { recursive: true });
  const merged: AIQuota = {
    dailyCalls: q.dailyCalls && q.dailyCalls > 0 ? Math.floor(q.dailyCalls) : DEFAULT_QUOTA.dailyCalls,
    monthlyTokens:
      q.monthlyTokens && q.monthlyTokens > 0 ? Math.floor(q.monthlyTokens) : DEFAULT_QUOTA.monthlyTokens,
  };
  await fs.writeFile(quotaFile(userId), JSON.stringify(merged), "utf8");
  return merged;
}

async function readUsageRecords(userId: string): Promise<UsageRecord[]> {
  try {
    const raw = await fs.readFile(usageFile(userId), "utf8");
    const parsed = JSON.parse(raw) as UsageRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export interface BudgetCheck {
  allowed: boolean;
  reason?: string;
  usage?: UsageSummary;
  quota?: AIQuota;
}

/** 调用 LLM 前的预算闸门。超限返回 allowed:false 与友好提示语。 */
export async function checkBudget(userId: string): Promise<BudgetCheck> {
  const quota = await getQuota(userId);
  const usage = await getUsage(userId);

  if (usage.monthTokens >= quota.monthlyTokens) {
    return {
      allowed: false,
      reason: `本月 AI Token 额度（${quota.monthlyTokens.toLocaleString()}）已达上限，请下月再试或调整额度设置`,
      usage,
      quota,
    };
  }

  const dayStart = Date.now() - 24 * 3600 * 1000;
  const records = await readUsageRecords(userId);
  const dayCalls = records.filter((r) => r.timestamp >= dayStart && r.success).length;
  if (dayCalls >= quota.dailyCalls) {
    return {
      allowed: false,
      reason: `今日 AI 分析额度（${quota.dailyCalls} 次/日）已达到限制，请明日再试`,
      usage,
      quota,
    };
  }

  return { allowed: true, usage, quota };
}
