/**
 * RAG 检索器（Phase 6.6，用户需求五；兼容 Phase 3.3 financialRetriever 契约）。
 *
 * 流程：User Question → Query Rewrite → Embedding → Vector Search
 *       →（用户私人知识库 + 系统公共知识库 双空间检索合并）
 *       → Context Builder → 供 LLM 使用的知识上下文。
 *
 * Query Rewrite 采用本地规则改写（去口语助词 + 财务领域同义扩展），
 * 零 LLM 成本、确定性可测；未来可切 LLM 改写，接口不变。
 */
import "server-only";

import { createEmbeddingProvider } from "../embeddings";
import { createVectorStore } from "../vectorstore";
import {
  KNOWLEDGE_CATEGORY_LABELS,
  SYSTEM_KNOWLEDGE_USER_ID,
  type KnowledgeContext,
  type KnowledgeScope,
  type KnowledgeSourceRef,
  type RetrievalResult,
  type VectorSearchHit,
} from "../types";

/** 低于该相似度的命中视为噪声，不进入上下文。 */
const MIN_SCORE = 0.05;
/** 默认 top-k。 */
const DEFAULT_TOP_K = 5;
/** 上下文最大字符数（防 prompt 膨胀）。 */
const MAX_CONTEXT_CHARS = 2400;

/** 财务领域同义扩展表：命中关键词时把同义词拼进检索 query，提升召回。 */
const SYNONYMS: Array<[RegExp, string]> = [
  [/退休|养老|retire/i, "退休规划 养老金 4%法则 FIRE 财务自由 提取率"],
  [/投资|股票|基金|债券|理财/i, "资产配置 分散投资 风险收益 长期投资 指数基金"],
  [/风险|保险|负债|债务|杠杆/i, "风险管理 应急基金 保障 偿债能力 保额"],
  [/储蓄|存款|复利|利息/i, "复利 储蓄率 现金流 预算"],
  [/通胀|通货膨胀|物价/i, "通货膨胀 购买力 实际收益率"],
  [/税|个税|扣除/i, "税务优化 专项附加扣除 个人所得税"],
  [/买房|房贷|教育|传承/i, "家庭财富规划 房贷 教育金 资产传承"],
];

/** 口语噪声词（改写时剔除，聚焦实体与领域词）。 */
const STOPWORDS_RE =
  /(请问|一下|帮我|我想|我要|怎么样|怎么办|如何|什么是|是什么|吗|呢|啊|的|了|能不能|可以)/g;

/** 各 Agent 的默认检索词（无用户问题时使用）。 */
const AGENT_DEFAULT_QUERY: Record<string, string> = {
  cashflow: "现金流 预算 储蓄率 应急基金",
  investment: "资产配置 分散投资 指数基金 风险收益",
  risk: "风险管理 保险配置 负债控制 应急基金",
  retirement: "退休规划 养老金 4%法则 FIRE",
  strategy: "财富规划 资产配置 长期目标",
  summary: "个人财务规划 资产配置 风险管理",
};

/** Query Rewrite：去噪 + 同义扩展（导出以便单测与验收脚本复用）。 */
export function rewriteQuery(question: string): string {
  const base = question.replace(STOPWORDS_RE, " ").replace(/\s+/g, " ").trim();
  const expansions = SYNONYMS.filter(([re]) => re.test(question)).map(
    ([, words]) => words
  );
  return [base || question, ...expansions].join(" ");
}

/** 命中记录归属空间：系统共享 → global，其余 → personal。 */
export function hitScope(hit: VectorSearchHit): KnowledgeScope {
  return hit.record.userId === SYSTEM_KNOWLEDGE_USER_ID ? "global" : "personal";
}

/** 合并去重（同 chunk 取更高分），按分数降序。 */
function mergeHits(
  a: VectorSearchHit[],
  b: VectorSearchHit[],
  topK: number
): VectorSearchHit[] {
  const byId = new Map<string, VectorSearchHit>();
  for (const hit of [...a, ...b]) {
    const prev = byId.get(hit.record.id);
    if (!prev || hit.score > prev.score) byId.set(hit.record.id, hit);
  }
  return [...byId.values()]
    .filter((h) => h.score >= MIN_SCORE)
    .sort((x, y) => y.score - x.score)
    .slice(0, topK);
}

/** Context Builder：命中切片 → 可直接注入 prompt 的知识上下文。 */
export function buildKnowledgeContext(hits: VectorSearchHit[]): string {
  if (hits.length === 0) return "";
  const lines: string[] = [];
  let used = 0;
  for (let i = 0; i < hits.length; i++) {
    const { chunk } = hits[i].record;
    const label = KNOWLEDGE_CATEGORY_LABELS[chunk.category] ?? chunk.category;
    const entry = `【知识 ${i + 1}｜${chunk.title}｜${label}】\n${chunk.text}`;
    if (used + entry.length > MAX_CONTEXT_CHARS && lines.length > 0) break;
    lines.push(entry);
    used += entry.length;
  }
  return lines.join("\n\n");
}

/** 命中 → 去重来源列表（仅真实命中，禁止虚构）。 */
export function buildSources(hits: VectorSearchHit[]): KnowledgeSourceRef[] {
  const seen = new Set<string>();
  const sources: KnowledgeSourceRef[] = [];
  for (const hit of hits) {
    const { chunk } = hit.record;
    const key = `${chunk.title}|${chunk.category}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push({
      title: chunk.title,
      category: KNOWLEDGE_CATEGORY_LABELS[chunk.category] ?? chunk.category,
      scope: hitScope(hit),
    });
  }
  return sources;
}

export interface RetrieveOptions {
  topK?: number;
  /** 是否合并系统共享知识库（默认 true）。 */
  includeSystem?: boolean;
}

/**
 * 主入口：对某用户执行一次 RAG 检索。
 * 严格隔离：只检索该 userId 的私人空间 +（可选）系统共享空间，
 * 绝不可能读到其他用户的向量（VectorStore 按 userId 分文件）。
 */
export async function retrieveKnowledge(
  userId: string,
  question: string,
  options?: RetrieveOptions
): Promise<RetrievalResult> {
  const started = Date.now();
  const topK = options?.topK ?? DEFAULT_TOP_K;
  const includeSystem = options?.includeSystem ?? true;

  const rewritten = rewriteQuery(question);
  const provider = createEmbeddingProvider();
  const queryVector = await provider.embed(rewritten);

  const store = createVectorStore();
  const [userHits, systemHits] = await Promise.all([
    userId && userId !== SYSTEM_KNOWLEDGE_USER_ID
      ? store.search(userId, queryVector, topK)
      : Promise.resolve([] as VectorSearchHit[]),
    includeSystem
      ? store.search(SYSTEM_KNOWLEDGE_USER_ID, queryVector, topK)
      : Promise.resolve([] as VectorSearchHit[]),
  ]);

  const hits = mergeHits(userHits, systemHits, topK);
  return {
    question,
    rewrittenQuery: rewritten,
    hits,
    contextText: buildKnowledgeContext(hits),
    tookMs: Date.now() - started,
  };
}

/* ------------------- Phase 3.3 兼容层：financialRetriever ------------------- */

export interface RetrieveForAgentInput {
  agentId: string;
  question?: string;
  /** 用户 ID：提供则同时检索其私人知识库（Phase 6.6 隔离增强）。 */
  userId?: string;
}

/**
 * 兼容旧契约的检索门面：
 *   - retrieve(query, topK, userId)：双库检索，返回 KnowledgeContext；
 *   - retrieveForAgent({agentId, question, userId})：Agent 分析前的知识注入。
 */
export const financialRetriever = {
  async retrieve(
    query: string,
    topK = DEFAULT_TOP_K,
    userId?: string
  ): Promise<KnowledgeContext> {
    const result = await retrieveKnowledge(userId ?? "", query, { topK });
    return {
      text: result.contextText,
      sources: buildSources(result.hits),
      chunks: result.hits,
    };
  },

  async retrieveForAgent(input: RetrieveForAgentInput): Promise<KnowledgeContext> {
    const query =
      input.question?.trim() ||
      AGENT_DEFAULT_QUERY[input.agentId] ||
      "个人财务规划 资产配置";
    return this.retrieve(query, DEFAULT_TOP_K, input.userId);
  },
};
