import { NextResponse } from "next/server";
import {
  ensureKnowledgeSeeded,
  listDocuments,
  createVectorStore,
  createEmbeddingProvider,
  KNOWLEDGE_CATEGORY_LABELS,
  SYSTEM_KNOWLEDGE_USER_ID,
  type KnowledgeCategory,
  type KnowledgeDocument,
  type KnowledgeScope,
  type KnowledgeStats,
} from "@/knowledge";
import { getSessionUserId } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/knowledge/stats（Phase 6.6 新内核，响应契约与 Phase 3.3 一致）
 * Knowledge Center 页面数据源：公共库 + 个人库统计与文档清单。
 * 个人库严格取会话 userId；未登录时个人库为空。
 */
export async function GET() {
  await ensureKnowledgeSeeded();
  const userId = await getSessionUserId();

  const [globalDocs, personalDocs] = await Promise.all([
    listDocuments(SYSTEM_KNOWLEDGE_USER_ID),
    userId ? listDocuments(userId) : Promise.resolve([] as KnowledgeDocument[]),
  ]);

  const store = createVectorStore();
  const [globalChunks, personalChunks] = await Promise.all([
    store.count(SYSTEM_KNOWLEDGE_USER_ID),
    userId ? store.count(userId) : Promise.resolve(0),
  ]);

  return NextResponse.json({
    global: toStats("global", globalDocs, globalChunks),
    personal: toStats("personal", personalDocs, personalChunks),
    documents: {
      global: globalDocs.map(toDocMeta),
      personal: personalDocs.map(toDocMeta),
    },
  });
}

function toStats(
  scope: KnowledgeScope,
  docs: KnowledgeDocument[],
  chunkCount: number
): KnowledgeStats {
  const byCategory = new Map<KnowledgeCategory, number>();
  let updatedAt = 0;
  for (const d of docs) {
    byCategory.set(d.category, (byCategory.get(d.category) ?? 0) + 1);
    if (d.updatedAt > updatedAt) updatedAt = d.updatedAt;
  }
  return {
    scope,
    documentCount: docs.length,
    chunkCount,
    categories: [...byCategory.entries()].map(([category, count]) => ({
      category,
      label: KNOWLEDGE_CATEGORY_LABELS[category] ?? category,
      count,
    })),
    updatedAt,
    embeddingProvider: createEmbeddingProvider().name,
    ready: docs.some((d) => d.status === "ready"),
  };
}

function toDocMeta(d: KnowledgeDocument) {
  return {
    id: d.id,
    title: d.title,
    category: d.category,
    format: d.format,
    addedAt: d.createdAt,
    status: d.status,
    chunkCount: d.chunkCount,
  };
}
