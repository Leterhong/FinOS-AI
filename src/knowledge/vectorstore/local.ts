/**
 * LocalVectorStore —— 默认向量库实现（Phase 6.6）。
 *
 * 落盘：`.data/knowledge/vectors/{userId}.json`（AES-256-GCM 加密，按 userId 分文件隔离）。
 * 检索：内存余弦相似度全量扫描（向量已归一化，点积即余弦）。
 * 规模评估：单用户万级切片 × 256 维，全扫描 < 50ms，个人财务场景完全够用；
 * 更大规模时通过工厂切换 FAISS / Chroma / pgvector。
 */
import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { encryptToFileString, parseSecureFileString } from "@/security";
import { cosineSimilarity } from "../embeddings";
import type {
  EmbeddingVector,
  VectorRecord,
  VectorSearchHit,
  VectorStore,
  VectorStoreBackend,
} from "../types";

const BASE_DIR = path.join(process.cwd(), ".data", "knowledge", "vectors");

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
}

function fileFor(userId: string): string {
  return path.join(BASE_DIR, `${safeId(userId)}.json`);
}

export class LocalVectorStore implements VectorStore {
  readonly backend: VectorStoreBackend = "local";

  private async readAll(userId: string): Promise<VectorRecord[]> {
    try {
      const raw = await fs.readFile(fileFor(userId), "utf8");
      const parsed = parseSecureFileString<VectorRecord[]>(raw);
      if (parsed && Array.isArray(parsed.value)) {
        if (parsed.migrated) void this.writeAll(userId, parsed.value);
        return parsed.value;
      }
    } catch {
      /* 无文件或解析失败 → 空 */
    }
    return [];
  }

  private async writeAll(userId: string, records: VectorRecord[]): Promise<void> {
    await fs.mkdir(BASE_DIR, { recursive: true });
    await fs.writeFile(fileFor(userId), encryptToFileString(records), "utf8");
  }

  async upsert(userId: string, records: VectorRecord[]): Promise<void> {
    if (records.length === 0) return;
    const all = await this.readAll(userId);
    const incoming = new Set(records.map((r) => r.id));
    const kept = all.filter((r) => !incoming.has(r.id));
    await this.writeAll(userId, [...kept, ...records]);
  }

  async search(
    userId: string,
    vector: EmbeddingVector,
    topK: number
  ): Promise<VectorSearchHit[]> {
    const all = await this.readAll(userId);
    if (all.length === 0 || topK <= 0) return [];
    const scored: VectorSearchHit[] = all.map((record) => ({
      record,
      score: cosineSimilarity(vector, record.vector),
    }));
    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  async deleteByDocument(userId: string, documentId: string): Promise<void> {
    const all = await this.readAll(userId);
    const kept = all.filter((r) => r.documentId !== documentId);
    if (kept.length !== all.length) await this.writeAll(userId, kept);
  }

  async deleteAll(userId: string): Promise<void> {
    try {
      await fs.rm(fileFor(userId), { force: true });
    } catch {
      /* 不存在视为已删除 */
    }
  }

  async count(userId: string): Promise<number> {
    const all = await this.readAll(userId);
    return all.length;
  }
}
