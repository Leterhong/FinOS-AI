/**
 * Embedding 提供层（Phase 6.6）。
 *
 * 默认实现：本地确定性 Embedding（hashed n-gram bag → 固定 256 维 → L2 归一化）。
 * 设计动机：
 *   - 项目当前无真实模型 API Key，验收必须离线可复现；
 *   - 同一文本任何时刻产出完全相同的向量（确定性），保证缓存与测试稳定；
 *   - 中文无空格分词场景采用字符 bi-gram + tri-gram，检索效果对短问句足够。
 *
 * 预留：EmbeddingProvider 接口可接远程模型（OpenAI text-embedding 等），
 * 通过 createEmbeddingProvider() 工厂切换，不影响上层调用。
 */

import { createHash } from "node:crypto";
import { EMBEDDING_DIM, type EmbeddingVector } from "../types";

/** Embedding 提供者抽象（预留远程模型接入位）。 */
export interface EmbeddingProvider {
  readonly name: string;
  readonly dim: number;
  embed(text: string): Promise<EmbeddingVector>;
  embedBatch(texts: string[]): Promise<EmbeddingVector[]>;
}

/** 文本 → token 序列：英文单词小写 + 中文字符 bi/tri-gram。 */
export function tokenize(text: string): string[] {
  const cleaned = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];

  const tokens: string[] = [];
  // 英文/数字词
  for (const m of cleaned.matchAll(/[a-z0-9]+/g)) tokens.push(m[0]);
  // 连续 CJK 段 → 单字 + bi-gram + tri-gram
  for (const m of cleaned.matchAll(/[\u4e00-\u9fff]+/g)) {
    const seg = m[0];
    for (let i = 0; i < seg.length; i++) {
      tokens.push(seg[i]);
      if (i + 1 < seg.length) tokens.push(seg.slice(i, i + 2));
      if (i + 2 < seg.length) tokens.push(seg.slice(i, i + 3));
    }
  }
  return tokens;
}

/** token → [维度索引, 符号]：sha256 前 4 字节定位维度，第 5 字节定符号。 */
function hashToken(token: string): [number, 1 | -1] {
  const digest = createHash("sha256").update(token, "utf8").digest();
  const idx = digest.readUInt32BE(0) % EMBEDDING_DIM;
  const sign: 1 | -1 = digest[4] % 2 === 0 ? 1 : -1;
  return [idx, sign];
}

/** 本地确定性 embedding：hashed bag-of-ngrams + 符号哈希 + L2 归一化。 */
export function localEmbed(text: string): EmbeddingVector {
  const vec = new Array<number>(EMBEDDING_DIM).fill(0);
  const tokens = tokenize(text);
  if (tokens.length === 0) return vec;

  // 词频（sub-linear：1 + log(tf)，抑制高频词淹没语义）
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);

  for (const [token, count] of tf) {
    const [idx, sign] = hashToken(token);
    vec[idx] += sign * (1 + Math.log(count));
  }

  // L2 归一化 → 点积即余弦相似度
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < EMBEDDING_DIM; i++) vec[i] /= norm;
  }
  return vec;
}

/** 余弦相似度（向量已归一化时等价于点积，这里做通用实现）。 */
export function cosineSimilarity(a: EmbeddingVector, b: EmbeddingVector): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** 本地确定性提供者（默认）。 */
class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly name = "local-deterministic";
  readonly dim = EMBEDDING_DIM;

  async embed(text: string): Promise<EmbeddingVector> {
    return localEmbed(text);
  }

  async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
    return texts.map((t) => localEmbed(t));
  }
}

let providerSingleton: EmbeddingProvider | null = null;

/**
 * Embedding 工厂。当前仅 local；未来接远程模型时在此按
 * 环境变量 / 模型中心配置分支，上层代码零改动。
 */
export function createEmbeddingProvider(): EmbeddingProvider {
  if (!providerSingleton) providerSingleton = new LocalEmbeddingProvider();
  return providerSingleton;
}
