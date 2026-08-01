/**
 * AI 分析结果缓存管理器（Phase 6.5）。
 *
 * 落盘：`.data/ai-cache/{userId}.json`（AES-256-GCM 加密，按 userId 隔离）。
 * 复用项目统一的 `src/security` 加密信封，并对历史明文文件做透明迁移（读到即加密回写）。
 *
 * 不同分析类型有不同的缓存时长（TTL）：
 *   - 财富评分 / 退休规划：24h
 *   - 风险分析：12h
 *   - 投资分析：6h
 *   - 市场分析：30min
 *   - 聊天：不缓存（TTL=0）
 */
import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { encryptToFileString, parseSecureFileString } from "@/security";
import type { AIAnalysisCache, AIAnalysisType } from "./types";

const BASE_DIR = path.join(process.cwd(), ".data", "ai-cache");

const TTL_MS: Record<AIAnalysisType, number> = {
  cfo_summary: 24 * 3600 * 1000,
  retirement_plan: 24 * 3600 * 1000,
  risk_report: 12 * 3600 * 1000,
  investment_report: 6 * 3600 * 1000,
  financial_advice: 12 * 3600 * 1000,
  market_analysis: 30 * 60 * 1000,
  chat: 0,
};

export function cacheTtl(type: AIAnalysisType): number {
  return TTL_MS[type] ?? 12 * 3600 * 1000;
}

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
}

function fileFor(userId: string): string {
  return path.join(BASE_DIR, `${safeId(userId)}.json`);
}

async function readAll(userId: string): Promise<AIAnalysisCache[]> {
  try {
    const raw = await fs.readFile(fileFor(userId), "utf8");
    const parsed = parseSecureFileString<AIAnalysisCache[]>(raw);
    if (parsed && Array.isArray(parsed.value)) {
      if (parsed.migrated) {
        // 历史明文 → 加密回写（透明迁移）
        void writeAll(userId, parsed.value);
      }
      return parsed.value;
    }
  } catch {
    /* 无文件或解析失败 → 视为空 */
  }
  return [];
}

async function writeAll(userId: string, items: AIAnalysisCache[]): Promise<void> {
  await fs.mkdir(BASE_DIR, { recursive: true });
  await fs.writeFile(fileFor(userId), encryptToFileString(items), "utf8");
}

export function isFresh(entry: AIAnalysisCache, now = Date.now()): boolean {
  return entry.expireAt > now;
}

/** 精确命中：type + inputHash + 未过期。 */
export async function getCache(
  userId: string,
  type: AIAnalysisType,
  inputHash: string
): Promise<AIAnalysisCache | null> {
  const all = await readAll(userId);
  const hit = all.find(
    (e) => e.type === type && e.inputHash === inputHash && isFresh(e)
  );
  return hit ?? null;
}

/** 写入（同 type+inputHash 覆盖，最多保留 50 条）。 */
export async function setCache(entry: AIAnalysisCache): Promise<void> {
  const all = await readAll(entry.userId);
  const filtered = all.filter(
    (e) => !(e.type === entry.type && e.inputHash === entry.inputHash)
  );
  filtered.push(entry);
  const capped = filtered.slice(-50);
  await writeAll(entry.userId, capped);
}

/** 取某类型最近一次缓存（无论是否过期，用于降级回退）。 */
export async function getLatestByType(
  userId: string,
  type: AIAnalysisType
): Promise<AIAnalysisCache | null> {
  const all = await readAll(userId);
  const list = all.filter((e) => e.type === type);
  if (list.length === 0) return null;
  return list.sort((a, b) => b.createdAt - a.createdAt)[0];
}

/** 取该用户全局最近一次分析（Dashboard 展示「最近结果」）。 */
export async function getLatestAnalysisCache(
  userId: string
): Promise<AIAnalysisCache | null> {
  const all = await readAll(userId);
  if (all.length === 0) return null;
  return all.sort((a, b) => b.createdAt - a.createdAt)[0];
}

/** 失效：删除某用户全部或指定类型的缓存（数据变化时调用）。 */
export async function invalidateUser(
  userId: string,
  type?: AIAnalysisType
): Promise<void> {
  const all = await readAll(userId);
  const remaining = type ? all.filter((e) => e.type !== type) : [];
  if (remaining.length !== all.length) {
    await writeAll(userId, remaining);
  }
}
