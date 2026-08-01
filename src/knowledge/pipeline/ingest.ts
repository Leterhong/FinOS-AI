/**
 * 文档摄取管线（Phase 6.6，用户需求三 + 十六）。
 *
 * 流程：Document(pending) → 解析 → Chunk → Embedding → VectorStore(ready)。
 *
 * 异步策略（需求十六）：
 *   - 上传 API 只做「保存原文 + 建元信息 + 入队」，立即返回，不阻塞；
 *   - 进程内 FIFO 队列串行消费（Embedding 为本地 CPU 计算，串行避免争抢）；
 *   - 失败回写 status="failed" + error，可重新触发。
 */
import "server-only";

import { chunkText } from "../chunk";
import { createEmbeddingProvider } from "../embeddings";
import { createVectorStore } from "../vectorstore";
import {
  createDocument,
  deleteDocument,
  getDocument,
  getDocumentContent,
  setDocumentStatus,
  updateDocument,
} from "../documents";
import { parseDocument } from "./parse";
import type {
  DocumentChunk,
  DocumentFormat,
  IngestTask,
  KnowledgeCategory,
  KnowledgeDocument,
  VectorRecord,
} from "../types";

/* ------------------------------ 异步任务队列 ------------------------------ */

const queue: IngestTask[] = [];
let draining = false;

function enqueue(task: IngestTask): void {
  queue.push(task);
  if (!draining) void drain();
}

async function drain(): Promise<void> {
  draining = true;
  try {
    while (queue.length > 0) {
      const task = queue.shift()!;
      try {
        await processDocument(task.userId, task.documentId);
      } catch (err) {
        // processDocument 内部已回写 failed；此处兜底避免队列中断
        console.error("[knowledge] ingest task failed:", err);
      }
    }
  } finally {
    draining = false;
  }
}

/** 当前队列长度（监控 / 测试用）。 */
export function ingestQueueSize(): number {
  return queue.length + (draining ? 1 : 0);
}

/* ------------------------------- 摄取入口 ------------------------------- */

export interface IngestInput {
  userId: string;
  title: string;
  category: KnowledgeCategory;
  format: DocumentFormat;
  /** 文本内容（txt/md）或二进制 base64（pdf/docx 由 API 层解码后传 Buffer）。 */
  data: Buffer | string;
  fileName?: string;
  /**
   * true = 同步处理完成后返回（验收脚本 / 内置知识库播种用）；
   * false（默认）= 入队异步处理，立即返回 pending 文档。
   */
  waitForReady?: boolean;
}

/**
 * 摄取一篇文档。默认异步：先落原文与元信息，再入队处理。
 * 注意：pdf/docx 的解析发生在队列处理阶段，因此原文存储保存的是
 * 解析后的纯文本 —— 为此这里先行解析（解析失败立即报错给上传方，
 * 比入库后再失败的体验更好）。
 */
export async function ingestDocument(input: IngestInput): Promise<KnowledgeDocument> {
  // 1) 解析为纯文本（txt/md 零成本；pdf/docx 走可选依赖）
  const text = await parseDocument(input.format, input.data);
  if (!text || text.trim().length === 0) {
    throw new Error("文档内容为空，无法入库");
  }

  // 2) 建档（原文 = 解析后的纯文本，pending）
  const doc = await createDocument({
    userId: input.userId,
    title: input.title,
    category: input.category,
    format: input.format,
    content: text,
    fileName: input.fileName,
  });

  // 3) 同步 or 入队
  if (input.waitForReady) {
    await processDocument(input.userId, doc.id);
    return (await getDocument(input.userId, doc.id)) ?? doc;
  }
  enqueue({ documentId: doc.id, userId: input.userId, enqueuedAt: Date.now() });
  return doc;
}

/** 队列消费：切片 → Embedding → 向量入库 → 状态 ready。 */
export async function processDocument(
  userId: string,
  documentId: string
): Promise<void> {
  const doc = await getDocument(userId, documentId);
  if (!doc) return;
  await setDocumentStatus(userId, documentId, "processing");

  try {
    const content = await getDocumentContent(userId, documentId);
    if (!content) throw new Error("原文丢失或无法解密");

    const pieces = chunkText(content);
    if (pieces.length === 0) throw new Error("切片结果为空");

    const provider = createEmbeddingProvider();
    const vectors = await provider.embedBatch(pieces);

    const records: VectorRecord[] = pieces.map((text, i) => {
      const chunk: DocumentChunk = {
        id: `${documentId}#${i}`,
        documentId,
        userId,
        index: i,
        text,
        title: doc.title,
        category: doc.category,
      };
      return { id: chunk.id, documentId, userId, vector: vectors[i], chunk };
    });

    const store = createVectorStore();
    // 先清旧向量（重新摄取场景），再写新向量
    await store.deleteByDocument(userId, documentId);
    await store.upsert(userId, records);

    await updateDocument(userId, documentId, {
      status: "ready",
      chunkCount: records.length,
      error: undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setDocumentStatus(userId, documentId, "failed", msg);
    throw err;
  }
}

/** 删除文档：元信息 + 原文 + 向量一并清理。 */
export async function removeDocument(
  userId: string,
  documentId: string
): Promise<boolean> {
  const store = createVectorStore();
  await store.deleteByDocument(userId, documentId);
  return deleteDocument(userId, documentId);
}
