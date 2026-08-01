/**
 * 记忆检索器（Phase 6.6，用户需求十）。
 *
 * 流程：Question → Embedding →（与记忆内容向量比对）→ Relevant Memory。
 * 评分 = 语义相似度 × 0.7 + 重要度归一 × 0.2 + 新近度 × 0.1，
 * 保证「40 岁退休」这类高重要度目标在相关问题上稳定召回。
 *
 * 复用知识系统的本地确定性 Embedding（零成本、离线可用）。
 */
import "server-only";

import { cosineSimilarity, localEmbed } from "@/knowledge/embeddings";
import { listMemories } from "./store";
import type { MemoryItem, MemorySearchHit, MemoryType } from "./types";

const DEFAULT_TOP_K = 6;
/** 相关度下限（低于此分不注入上下文）。 */
const MIN_SCORE = 0.08;
/** 新近度半衰期：90 天。 */
const RECENCY_HALF_LIFE_MS = 90 * 24 * 3600 * 1000;

function recencyScore(item: MemoryItem, now: number): number {
  const age = Math.max(0, now - item.updatedAt);
  return Math.pow(0.5, age / RECENCY_HALF_LIFE_MS);
}

export interface MemorySearchOptions {
  topK?: number;
  types?: MemoryType[];
}

/** 语义检索该用户的长期记忆。 */
export async function searchMemories(
  userId: string,
  question: string,
  options?: MemorySearchOptions
): Promise<MemorySearchHit[]> {
  const topK = options?.topK ?? DEFAULT_TOP_K;
  const all = await listMemories(userId);
  const pool = options?.types
    ? all.filter((m) => options.types!.includes(m.type))
    : all;
  if (pool.length === 0) return [];

  const qVec = localEmbed(question);
  const now = Date.now();

  const hits: MemorySearchHit[] = pool.map((item) => {
    const sim = cosineSimilarity(qVec, localEmbed(item.content));
    const score =
      sim * 0.7 + (item.importance / 5) * 0.2 + recencyScore(item, now) * 0.1;
    return { item, score };
  });

  return hits
    .filter((h) => h.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
