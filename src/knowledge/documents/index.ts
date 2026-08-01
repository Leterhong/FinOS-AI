/**
 * 知识文档存储（Phase 6.6）。
 *
 * 落盘（均 AES-256-GCM 加密、按 userId 分文件隔离）：
 *   - 元信息：`.data/knowledge/documents/{userId}.json`
 *   - 原文文本：`.data/knowledge/contents/{userId}/{documentId}.json`
 *     （原文与元信息分离，列表读取不必加载大文本）
 */
import "server-only";

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { encryptToFileString, parseSecureFileString } from "@/security";
import type {
  DocumentFormat,
  DocumentStatus,
  KnowledgeCategory,
  KnowledgeDocument,
} from "../types";

const META_DIR = path.join(process.cwd(), ".data", "knowledge", "documents");
const CONTENT_DIR = path.join(process.cwd(), ".data", "knowledge", "contents");

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
}

function metaFile(userId: string): string {
  return path.join(META_DIR, `${safeId(userId)}.json`);
}

function contentFile(userId: string, documentId: string): string {
  return path.join(CONTENT_DIR, safeId(userId), `${safeId(documentId)}.json`);
}

async function readMetaAll(userId: string): Promise<KnowledgeDocument[]> {
  try {
    const raw = await fs.readFile(metaFile(userId), "utf8");
    const parsed = parseSecureFileString<KnowledgeDocument[]>(raw);
    if (parsed && Array.isArray(parsed.value)) {
      if (parsed.migrated) void writeMetaAll(userId, parsed.value);
      return parsed.value;
    }
  } catch {
    /* 无文件 → 空 */
  }
  return [];
}

async function writeMetaAll(
  userId: string,
  docs: KnowledgeDocument[]
): Promise<void> {
  await fs.mkdir(META_DIR, { recursive: true });
  await fs.writeFile(metaFile(userId), encryptToFileString(docs), "utf8");
}

/** 创建文档记录并保存原文，初始状态 pending。 */
export async function createDocument(input: {
  userId: string;
  title: string;
  category: KnowledgeCategory;
  format: DocumentFormat;
  content: string;
  fileName?: string;
}): Promise<KnowledgeDocument> {
  const now = Date.now();
  const doc: KnowledgeDocument = {
    id: randomUUID(),
    userId: input.userId,
    title: input.title.slice(0, 200),
    category: input.category,
    format: input.format,
    fileName: input.fileName,
    contentLength: input.content.length,
    chunkCount: 0,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };

  // 原文单独加密落盘
  const cf = contentFile(input.userId, doc.id);
  await fs.mkdir(path.dirname(cf), { recursive: true });
  await fs.writeFile(cf, encryptToFileString({ content: input.content }), "utf8");

  const all = await readMetaAll(input.userId);
  all.push(doc);
  await writeMetaAll(input.userId, all);
  return doc;
}

/** 读取文档原文（null = 不存在或损坏）。 */
export async function getDocumentContent(
  userId: string,
  documentId: string
): Promise<string | null> {
  try {
    const raw = await fs.readFile(contentFile(userId, documentId), "utf8");
    const parsed = parseSecureFileString<{ content: string }>(raw);
    if (parsed && typeof parsed.value?.content === "string") {
      return parsed.value.content;
    }
  } catch {
    /* 不存在 */
  }
  return null;
}

/** 列出该用户全部文档（按创建时间倒序）。 */
export async function listDocuments(
  userId: string
): Promise<KnowledgeDocument[]> {
  const all = await readMetaAll(userId);
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

/** 取单个文档元信息。 */
export async function getDocument(
  userId: string,
  documentId: string
): Promise<KnowledgeDocument | null> {
  const all = await readMetaAll(userId);
  return all.find((d) => d.id === documentId) ?? null;
}

/** 更新文档状态 / 切片数 / 错误信息（摄取管线回写用）。 */
export async function updateDocument(
  userId: string,
  documentId: string,
  patch: Partial<Pick<KnowledgeDocument, "status" | "chunkCount" | "error" | "title">>
): Promise<KnowledgeDocument | null> {
  const all = await readMetaAll(userId);
  const idx = all.findIndex((d) => d.id === documentId);
  if (idx < 0) return null;
  const next: KnowledgeDocument = {
    ...all[idx],
    ...patch,
    updatedAt: Date.now(),
  };
  all[idx] = next;
  await writeMetaAll(userId, all);
  return next;
}

/** 更新状态的便捷封装。 */
export async function setDocumentStatus(
  userId: string,
  documentId: string,
  status: DocumentStatus,
  error?: string
): Promise<void> {
  await updateDocument(userId, documentId, { status, error });
}

/** 删除文档（元信息 + 原文）。向量删除由调用方（pipeline）负责。 */
export async function deleteDocument(
  userId: string,
  documentId: string
): Promise<boolean> {
  const all = await readMetaAll(userId);
  const kept = all.filter((d) => d.id !== documentId);
  if (kept.length === all.length) return false;
  await writeMetaAll(userId, kept);
  try {
    await fs.rm(contentFile(userId, documentId), { force: true });
  } catch {
    /* 忽略 */
  }
  return true;
}

/** 删除该用户全部文档数据（隐私：清除所有）。 */
export async function deleteAllDocuments(userId: string): Promise<void> {
  try {
    await fs.rm(metaFile(userId), { force: true });
    await fs.rm(path.join(CONTENT_DIR, safeId(userId)), {
      recursive: true,
      force: true,
    });
  } catch {
    /* 忽略 */
  }
}
