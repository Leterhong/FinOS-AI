import "server-only";

/**
 * Document Storage（Financial Twin 6.x，需求三）—— 仅服务端。
 *  - 文件按用户隔离存储：.data/documents/{userId}/{storedName}；
 *  - 元数据：.data/documents/{userId}/index.json（不含文件内容）；
 *  - 类型白名单（PDF/Excel/CSV/图片）+ 单文件 10MB 上限；
 *  - 预留 RAG：ragStatus 标记解析 / 索引进度，后续财务分析可检索引用。
 */

import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import {
  ALLOWED_DOC_TYPES,
  MAX_DOC_SIZE,
  type DocumentCategory,
  type DocumentMeta,
} from "./types";

const BASE_DIR = path.join(process.cwd(), ".data", "documents");

/** 安全化 userId，防止路径穿越。 */
function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function dirOf(userId: string): string {
  return path.join(BASE_DIR, sanitize(userId));
}

function indexOf(userId: string): string {
  return path.join(dirOf(userId), "index.json");
}

function readIndex(userId: string): DocumentMeta[] {
  try {
    const fp = indexOf(userId);
    if (!fs.existsSync(fp)) return [];
    const parsed = JSON.parse(fs.readFileSync(fp, "utf-8"));
    return Array.isArray(parsed) ? (parsed as DocumentMeta[]) : [];
  } catch {
    return [];
  }
}

function writeIndex(userId: string, list: DocumentMeta[]): void {
  const dir = dirOf(userId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(indexOf(userId), JSON.stringify(list, null, 2), "utf-8");
}

/** 校验结果。 */
export interface DocValidation {
  ok: boolean;
  error?: string;
  ext?: string;
}

/** 校验 MIME 类型与大小（白名单 + 10MB）。 */
export function validateDocument(
  fileName: string,
  mimeType: string,
  size: number
): DocValidation {
  if (size <= 0) return { ok: false, error: "文件为空" };
  if (size > MAX_DOC_SIZE) {
    return { ok: false, error: "文件超过 10MB 上限" };
  }
  const exts = ALLOWED_DOC_TYPES[mimeType];
  const nameExt = path.extname(fileName).toLowerCase();
  if (exts && exts.includes(nameExt)) return { ok: true, ext: nameExt };
  // MIME 与扩展名双重校验：任一不在白名单即拒绝
  return {
    ok: false,
    error: "仅支持 PDF / Excel / CSV / 图片（png、jpg、webp）",
  };
}

class DocumentStorage {
  /** 保存文档（内容 + 元数据）。调用方需先 validateDocument。 */
  save(
    userId: string,
    fileName: string,
    mimeType: string,
    category: DocumentCategory,
    content: Buffer
  ): DocumentMeta {
    const uid = sanitize(userId);
    const ext = path.extname(fileName).toLowerCase();
    const id = `doc-${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
    const storedName = `${id}${ext}`;
    const dir = dirOf(uid);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, storedName), content);

    const meta: DocumentMeta = {
      id,
      userId: uid,
      fileName: fileName.slice(0, 200),
      storedName,
      mimeType,
      size: content.length,
      category,
      uploadedAt: Date.now(),
      ragStatus: "uploaded",
    };
    const list = readIndex(uid);
    list.unshift(meta);
    writeIndex(uid, list);
    return meta;
  }

  /** 列出用户全部文档元数据（按上传时间倒序）。 */
  list(userId: string): DocumentMeta[] {
    return readIndex(sanitize(userId));
  }

  /** 读取单个文档内容（含元数据）。 */
  read(userId: string, docId: string): { meta: DocumentMeta; content: Buffer } | null {
    const uid = sanitize(userId);
    const meta = readIndex(uid).find((d) => d.id === docId);
    if (!meta) return null;
    try {
      const fp = path.join(dirOf(uid), meta.storedName);
      if (!fs.existsSync(fp)) return null;
      return { meta, content: fs.readFileSync(fp) };
    } catch {
      return null;
    }
  }

  /** 删除单个文档（文件 + 元数据）。 */
  delete(userId: string, docId: string): boolean {
    const uid = sanitize(userId);
    const list = readIndex(uid);
    const meta = list.find((d) => d.id === docId);
    if (!meta) return false;
    try {
      const fp = path.join(dirOf(uid), meta.storedName);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch {
      /* 文件删除失败仍移除元数据，避免死条目 */
    }
    writeIndex(
      uid,
      list.filter((d) => d.id !== docId)
    );
    return true;
  }

  /** 删除用户全部文档（删除账户 / 清除数据时调用）。 */
  deleteAll(userId: string): void {
    try {
      const dir = dirOf(sanitize(userId));
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* 容错 */
    }
  }
}

export const documentStorage = new DocumentStorage();
