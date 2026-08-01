import "server-only";

/**
 * Multimodal Analysis Store —— 文档分析记录持久化（仅服务端）。
 *  - 按 userId 分文件：.data/multimodal/{userId}.json（AES-256-GCM 加密）；
 *  - Document Hash 索引：同文件（sha256 相同）只分析一次（需求十二）；
 *  - 与 documentStorage（.data/documents/）通过 docId 一一关联；
 *  - 删除文档时同步删除分析记录（权限解除，需求十四④）。
 */

import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { encryptToFileString, parseSecureFileString } from "@/security";
import type { DocumentAnalysis } from "./types";

const BASE_DIR = path.join(process.cwd(), ".data", "multimodal");

function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function fileOf(userId: string): string {
  return path.join(BASE_DIR, `${sanitize(userId)}.json`);
}

function readAll(userId: string): DocumentAnalysis[] {
  try {
    const fp = fileOf(userId);
    if (!fs.existsSync(fp)) return [];
    const parsed = parseSecureFileString<DocumentAnalysis[]>(
      fs.readFileSync(fp, "utf-8")
    );
    return Array.isArray(parsed?.value) ? parsed.value : [];
  } catch {
    return [];
  }
}

function writeAll(userId: string, list: DocumentAnalysis[]): void {
  if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
  fs.writeFileSync(fileOf(userId), encryptToFileString(list), "utf-8");
}

/** 生成分析记录 id */
export function newAnalysisId(): string {
  return `ana-${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
}

class AnalysisStore {
  /** 列出用户全部分析记录（按创建时间倒序） */
  list(userId: string): DocumentAnalysis[] {
    return readAll(userId).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }

  /** 按分析 id 获取 */
  get(userId: string, analysisId: string): DocumentAnalysis | null {
    return readAll(userId).find((a) => a.id === analysisId) ?? null;
  }

  /** 按文档 id 获取（一份文档对应最新一条分析） */
  getByDocId(userId: string, docId: string): DocumentAnalysis | null {
    const hits = readAll(userId)
      .filter((a) => a.docId === docId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return hits[0] ?? null;
  }

  /** Document Hash 去重：查找同内容文件的既有有效分析 */
  findByHash(userId: string, hash: string): DocumentAnalysis | null {
    const hits = readAll(userId)
      .filter((a) => a.hash === hash && a.status !== "failed")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return hits[0] ?? null;
  }

  /** upsert（按 id） */
  save(analysis: DocumentAnalysis): DocumentAnalysis {
    const userId = sanitize(analysis.userId);
    const list = readAll(userId);
    const idx = list.findIndex((a) => a.id === analysis.id);
    const next = { ...analysis, userId, updatedAt: new Date().toISOString() };
    if (idx >= 0) list[idx] = next;
    else list.unshift(next);
    writeAll(userId, list);
    return next;
  }

  /** 部分更新 */
  update(
    userId: string,
    analysisId: string,
    patch: Partial<DocumentAnalysis>
  ): DocumentAnalysis | null {
    const list = readAll(userId);
    const idx = list.findIndex((a) => a.id === analysisId);
    if (idx < 0) return null;
    list[idx] = {
      ...list[idx],
      ...patch,
      id: list[idx].id,
      userId: list[idx].userId,
      updatedAt: new Date().toISOString(),
    };
    writeAll(userId, list);
    return list[idx];
  }

  /** 删除文档时清理其全部分析记录 */
  removeByDocId(userId: string, docId: string): number {
    const list = readAll(userId);
    const next = list.filter((a) => a.docId !== docId);
    if (next.length === list.length) return 0;
    writeAll(userId, next);
    return list.length - next.length;
  }

  /** 清空用户全部分析记录（删除账户时） */
  clear(userId: string): void {
    try {
      const fp = fileOf(userId);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch {
      /* 容错 */
    }
  }
}

export const analysisStore = new AnalysisStore();
