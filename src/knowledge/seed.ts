/**
 * 系统公共知识库播种（Phase 6.6，收编 Phase 3.3 内置 6 大类种子文档）。
 *
 * 内容来源：src/knowledge/documents/{personal-finance,investment,retirement,
 * insurance,tax,family-wealth}.ts —— 随代码内置的公共金融知识（Markdown）。
 * 写入系统共享空间（SYSTEM_KNOWLEDGE_USER_ID），全体用户可检索。
 * 幂等：以标题判重，已存在则跳过。内容为金融教育知识，不构成投资建议。
 */
import "server-only";

import { listDocuments } from "./documents";
import { ingestDocument } from "./pipeline/ingest";
import { SYSTEM_KNOWLEDGE_USER_ID } from "./types";
import type { SeedDocument } from "./documents/types";
import { personalFinanceDocs } from "./documents/personal-finance";
import { investmentDocs } from "./documents/investment";
import { retirementDocs } from "./documents/retirement";
import { insuranceDocs } from "./documents/insurance";
import { taxDocs } from "./documents/tax";
import { familyWealthDocs } from "./documents/family-wealth";

const SEED_DOCS: SeedDocument[] = [
  ...personalFinanceDocs,
  ...investmentDocs,
  ...retirementDocs,
  ...insuranceDocs,
  ...taxDocs,
  ...familyWealthDocs,
];

let seededPromise: Promise<number> | null = null;

/**
 * 播种系统知识库（幂等）。返回本次新增的文档数。
 * 进程内并发调用共享同一次播种，避免重复摄取。
 */
export async function seedSystemKnowledge(): Promise<number> {
  if (!seededPromise) seededPromise = doSeed();
  try {
    return await seededPromise;
  } catch (err) {
    seededPromise = null; // 失败允许重试
    throw err;
  }
}

async function doSeed(): Promise<number> {
  const existing = await listDocuments(SYSTEM_KNOWLEDGE_USER_ID);
  const existingTitles = new Set(existing.map((d) => d.title));
  let added = 0;
  for (const seedDoc of SEED_DOCS) {
    if (existingTitles.has(seedDoc.title)) continue;
    await ingestDocument({
      userId: SYSTEM_KNOWLEDGE_USER_ID,
      title: seedDoc.title,
      category: seedDoc.category,
      format: "markdown",
      data: seedDoc.content,
      waitForReady: true, // 播种同步完成，保证可立即检索
    });
    added += 1;
  }
  return added;
}

/** Phase 3.3 兼容别名（旧 API 路由调用名）。 */
export const ensureKnowledgeSeeded = seedSystemKnowledge;
