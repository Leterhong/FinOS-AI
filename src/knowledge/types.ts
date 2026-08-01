/**
 * RAG 财富知识系统 —— 统一类型定义（Phase 6.6，收编 Phase 3.3 Knowledge Brain）。
 *
 * 分类沿用既有 6 大类（覆盖需求的「基础金融/投资/退休/风险管理」四类并更细化），
 * 保持与 Knowledge Center 页面、种子文档完全兼容。
 *
 * 约定：
 *   - 所有数据严格按 userId 隔离；系统级公共知识库使用保留 userId = "__system__"。
 *   - VectorStore 为适配器接口，不绑定单一数据库（默认 Local，预留 FAISS/Chroma/pgvector）。
 */

/** 系统级（全体用户共享）知识库的保留归属 ID。 */
export const SYSTEM_KNOWLEDGE_USER_ID = "__system__";

/** 知识分类：6 大金融知识体系（需求四类的细化超集）。 */
export type KnowledgeCategory =
  | "personal-finance" // 基础金融 / 个人财务规划：预算 / 现金流 / 复利 / 资产配置
  | "investment" // 投资知识：股票 / 基金 / ETF / 债券 / 风险收益
  | "retirement" // 退休规划：养老金 / 4% 法则 / FIRE
  | "insurance" // 风险管理·保险：寿险 / 医疗险 / 重疾险 / 保障配置
  | "tax" // 税务知识：个税 / 税务优化
  | "family-wealth"; // 家庭财富规划：买房 / 教育 / 传承

export const KNOWLEDGE_CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  "personal-finance": "个人财务规划",
  investment: "投资知识",
  retirement: "退休规划",
  insurance: "保险规划",
  tax: "税务知识",
  "family-wealth": "家庭财富规划",
};

/** 知识范围：global = 系统公共知识库；personal = 用户私人知识库。 */
export type KnowledgeScope = "global" | "personal";

/** 支持的源文档格式（用户需求三）。 */
export type DocumentFormat = "pdf" | "docx" | "markdown" | "txt";

/** 文档摄取状态（需求十六：Embedding 异步处理）。 */
export type DocumentStatus =
  | "pending" // 已上传，等待处理
  | "processing" // 解析 / 切片 / Embedding 中
  | "ready" // 已入库，可被检索
  | "failed"; // 处理失败（error 字段说明原因）

/** 知识文档元信息（正文单独加密存储，避免大对象读写）。 */
export interface KnowledgeDocument {
  id: string;
  /** 归属用户；系统知识库为 SYSTEM_KNOWLEDGE_USER_ID。 */
  userId: string;
  title: string;
  category: KnowledgeCategory;
  format: DocumentFormat;
  /** 原始文件名（上传场景）。 */
  fileName?: string;
  /** 原文字符数。 */
  contentLength: number;
  /** 切片数量（ready 后填充）。 */
  chunkCount: number;
  status: DocumentStatus;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

/** 文本切片。 */
export interface DocumentChunk {
  id: string;
  documentId: string;
  userId: string;
  /** 在文档内的序号（从 0 开始）。 */
  index: number;
  text: string;
  /** 冗余文档标题 / 分类，检索后无需回查文档表即可构建上下文。 */
  title: string;
  category: KnowledgeCategory;
}

/** 向量维度（本地确定性 Embedding 固定 256 维）。 */
export const EMBEDDING_DIM = 256;

/** Embedding 向量。 */
export type EmbeddingVector = number[];

/** 向量库中的一条记录 = 切片 + 向量。 */
export interface VectorRecord {
  /** 即 chunk id。 */
  id: string;
  documentId: string;
  userId: string;
  vector: EmbeddingVector;
  chunk: DocumentChunk;
}

/** 向量检索命中结果。 */
export interface VectorSearchHit {
  record: VectorRecord;
  /** 余弦相似度，[-1, 1]，越大越相关。 */
  score: number;
}

/** 知识来源引用（用于"分析依据"展示，禁止虚构）。 */
export interface KnowledgeSourceRef {
  title: string;
  /** 分类中文名，例如 "投资知识"。 */
  category: string;
  /** global = 公共金融知识；personal = 用户个人资料。 */
  scope: KnowledgeScope;
}

/** Retriever 返回给 Agent 的完整知识上下文（Phase 3.3 兼容契约）。 */
export interface KnowledgeContext {
  /** 拼接好、可直接注入 Prompt 的知识文本（含来源标注）。 */
  text: string;
  /** 真实命中的来源列表（去重后）。 */
  sources: KnowledgeSourceRef[];
  /** 命中的原始片段（调试 / 展示用）。 */
  chunks: VectorSearchHit[];
}

/** RAG 最终检索结果（供 Context Builder 使用）。 */
export interface RetrievalResult {
  question: string;
  /** 改写后的检索 query。 */
  rewrittenQuery: string;
  hits: VectorSearchHit[];
  /** 拼接好的知识上下文（可直接注入 prompt）。 */
  contextText: string;
  tookMs: number;
}

/** 向量库统计信息（Knowledge Center 页面展示）。 */
export interface KnowledgeStats {
  scope: KnowledgeScope;
  documentCount: number;
  chunkCount: number;
  categories: { category: KnowledgeCategory; label: string; count: number }[];
  /** 最近更新时间（ms），0 表示尚未建库。 */
  updatedAt: number;
  /** 实际使用的嵌入提供方。 */
  embeddingProvider: string;
  ready: boolean;
}

/**
 * VectorStore 适配器接口（用户需求四）。
 * 默认实现 LocalVectorStore；FAISS / Chroma / pgvector 通过工厂预留接入位。
 */
export interface VectorStore {
  readonly backend: VectorStoreBackend;
  /** 批量插入 / 覆盖（同 id 覆盖）。 */
  upsert(userId: string, records: VectorRecord[]): Promise<void>;
  /** 相似度检索（仅在该 userId 空间内检索，天然隔离）。 */
  search(
    userId: string,
    vector: EmbeddingVector,
    topK: number
  ): Promise<VectorSearchHit[]>;
  /** 删除某文档的全部向量。 */
  deleteByDocument(userId: string, documentId: string): Promise<void>;
  /** 删除该用户全部向量（隐私：清除所有数据）。 */
  deleteAll(userId: string): Promise<void>;
  /** 该用户向量条数。 */
  count(userId: string): Promise<number>;
}

/** 可选的向量库后端。 */
export type VectorStoreBackend = "local" | "faiss" | "chroma" | "pgvector";

/** 切片配置。 */
export interface ChunkOptions {
  /** 每片最大字符数（中文场景按字符计）。默认 480。 */
  maxChars?: number;
  /** 相邻切片重叠字符数。默认 60。 */
  overlapChars?: number;
}

/** 摄取管线任务（需求十六：异步队列）。 */
export interface IngestTask {
  documentId: string;
  userId: string;
  enqueuedAt: number;
}
