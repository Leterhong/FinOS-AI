/**
 * 长期记忆存储层（Phase 6.6，用户需求七/十三/十五）。
 *
 * 落盘：`.data/memory/{userId}.json`（AES-256-GCM 加密，按 userId 分文件隔离）。
 * 能力：增 / 查 / 改 / 删单条 / 清除全部（隐私「清除所有 AI 记忆」按钮的后端）。
 * 去重：同 type + 归一化 content 视为同一记忆，重复写入时更新时间与重要度。
 */
import "server-only";

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { encryptToFileString, parseSecureFileString } from "@/security";
import type { MemoryItem, MemorySource, MemoryType } from "./types";

const BASE_DIR = path.join(process.cwd(), ".data", "memory");

/** 单用户记忆条数上限（超出时淘汰重要度最低、最旧的）。 */
const MAX_ITEMS = 500;

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
}

function fileFor(userId: string): string {
  return path.join(BASE_DIR, `${safeId(userId)}.json`);
}

async function readAll(userId: string): Promise<MemoryItem[]> {
  try {
    const raw = await fs.readFile(fileFor(userId), "utf8");
    const parsed = parseSecureFileString<MemoryItem[]>(raw);
    if (parsed && Array.isArray(parsed.value)) {
      if (parsed.migrated) void writeAll(userId, parsed.value);
      return parsed.value;
    }
  } catch {
    /* 无文件 → 空 */
  }
  return [];
}

async function writeAll(userId: string, items: MemoryItem[]): Promise<void> {
  await fs.mkdir(BASE_DIR, { recursive: true });
  await fs.writeFile(fileFor(userId), encryptToFileString(items), "utf8");
}

/** 内容归一化（去空白 / 标点差异），用于判重。 */
function normalize(content: string): string {
  return content.replace(/[\s。，,.!！?？;；:：]/g, "").toLowerCase();
}

export interface AddMemoryInput {
  userId: string;
  type: MemoryType;
  content: string;
  slots?: Record<string, string | number>;
  source: MemorySource;
  importance?: number;
  evidence?: string;
}

/** 写入一条记忆（同 type+内容判重 → 更新；容量超限 → 淘汰）。 */
export async function addMemory(input: AddMemoryInput): Promise<MemoryItem> {
  const all = await readAll(input.userId);
  const now = Date.now();
  const norm = normalize(input.content);
  const importance = clampImportance(input.importance ?? 3);

  const existing = all.find(
    (m) => m.type === input.type && normalize(m.content) === norm
  );
  if (existing) {
    existing.updatedAt = now;
    existing.importance = Math.max(existing.importance, importance);
    existing.slots = { ...existing.slots, ...input.slots };
    if (input.evidence) existing.evidence = input.evidence;
    await writeAll(input.userId, all);
    return existing;
  }

  const item: MemoryItem = {
    id: randomUUID(),
    userId: input.userId,
    type: input.type,
    content: input.content.slice(0, 500),
    slots: input.slots,
    source: input.source,
    importance,
    evidence: input.evidence?.slice(0, 500),
    createdAt: now,
    updatedAt: now,
  };
  all.push(item);

  // 容量控制：按（重要度升序，更新时间升序）淘汰
  let kept = all;
  if (all.length > MAX_ITEMS) {
    kept = [...all]
      .sort((a, b) => a.importance - b.importance || a.updatedAt - b.updatedAt)
      .slice(all.length - MAX_ITEMS);
  }
  await writeAll(input.userId, kept);
  return item;
}

/** 列出记忆（可按类型过滤，按更新时间倒序）。 */
export async function listMemories(
  userId: string,
  type?: MemoryType
): Promise<MemoryItem[]> {
  const all = await readAll(userId);
  const filtered = type ? all.filter((m) => m.type === type) : all;
  return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 修改一条记忆（Memory Center 编辑用）。 */
export async function updateMemory(
  userId: string,
  memoryId: string,
  patch: Partial<Pick<MemoryItem, "content" | "type" | "importance" | "slots">>
): Promise<MemoryItem | null> {
  const all = await readAll(userId);
  const idx = all.findIndex((m) => m.id === memoryId);
  if (idx < 0) return null;
  const next: MemoryItem = {
    ...all[idx],
    ...patch,
    importance: clampImportance(patch.importance ?? all[idx].importance),
    content: (patch.content ?? all[idx].content).slice(0, 500),
    updatedAt: Date.now(),
  };
  all[idx] = next;
  await writeAll(userId, all);
  return next;
}

/** 删除一条记忆。 */
export async function deleteMemory(
  userId: string,
  memoryId: string
): Promise<boolean> {
  const all = await readAll(userId);
  const kept = all.filter((m) => m.id !== memoryId);
  if (kept.length === all.length) return false;
  await writeAll(userId, kept);
  return true;
}

/** 清除该用户全部记忆（隐私按钮后端）。返回清除条数。 */
export async function clearMemories(userId: string): Promise<number> {
  const all = await readAll(userId);
  try {
    await fs.rm(fileFor(userId), { force: true });
  } catch {
    /* 不存在视为已清除 */
  }
  return all.length;
}

function clampImportance(v: number): number {
  return Math.min(5, Math.max(1, Math.round(v)));
}
