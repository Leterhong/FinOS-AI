import "server-only";

// ── RAG Wealth Knowledge System 总入口（Phase 6.6，收编 Phase 3.3）──────────
// LLM + 金融知识库 + 用户数据 + 长期记忆 = Personal AI CFO。
//
// 模块结构：
//   types.ts      全部类型定义（含 Phase 3.3 兼容类型）
//   documents/    文档元信息 + 原文存储（AES 加密、userId 隔离）+ 内置种子文档
//   chunk/        文本切片（段落 + 句边界 + 重叠）
//   embeddings/   Embedding 提供层（本地确定性 256 维，预留远程模型）
//   vectorstore/  VectorStore 适配器（Local 默认，预留 FAISS/Chroma/pgvector）
//   retriever/    RAG 检索（Query Rewrite → Vector Search → Context Builder）
//   pipeline/     文档解析 + 摄取管线 + 异步任务队列
//   seed.ts       系统公共知识库播种（6 大类内置文档，幂等）

export * from "./types";
export {
  financialRetriever,
  retrieveKnowledge,
  rewriteQuery,
  buildKnowledgeContext,
  buildSources,
  hitScope,
} from "./retriever";
export { createVectorStore, LocalVectorStore } from "./vectorstore";
export { createEmbeddingProvider, localEmbed, cosineSimilarity } from "./embeddings";
export { chunkText, normalizeText } from "./chunk";
export { parseDocument, inferFormat, markdownToText } from "./pipeline/parse";
export {
  ingestDocument,
  processDocument,
  removeDocument,
  ingestQueueSize,
} from "./pipeline/ingest";
export {
  listDocuments,
  getDocument,
  getDocumentContent,
  deleteAllDocuments,
} from "./documents";
export { seedSystemKnowledge, ensureKnowledgeSeeded } from "./seed";
