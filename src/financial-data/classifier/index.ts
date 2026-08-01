import "server-only";

/**
 * Transaction Classification Agent —— 金融交易分类。
 * 两级策略：
 *   1. 规则引擎（关键词命中，覆盖绝大多数国内消费场景，零成本零延迟）
 *   2. LLM 兜底（规则未命中的批量交给模型，JSON 输出；不可用时降级为 other）
 * 输出带 category / confidence / classifiedBy 的结构化交易。
 */

import { aiService } from "@/ai/gateway/AIService";
import type { AIMessage } from "@/ai/types";
import type { NormalizedTransaction, TransactionCategory } from "../types";
import type { TransactionDraft } from "../normalizer";
import { classifyByRule } from "./rules";

const VALID_CATEGORIES: TransactionCategory[] = [
  "dining", "transport", "shopping", "rent", "utilities", "entertainment",
  "medical", "education", "salary", "bonus", "investment", "insurance",
  "loan", "transfer", "other",
];

const LLM_TIMEOUT_MS = 25_000;
const LLM_BATCH_SIZE = 30;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } catch {
    return undefined;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 分类结果（尚未持久化，id/importId 由 storage 层补全） */
export type ClassifiedTransaction = Omit<NormalizedTransaction, "id" | "userId" | "importId">;

export interface ClassifyResult {
  transactions: ClassifiedTransaction[];
  /** 规则命中数 */
  ruleHits: number;
  /** LLM 分类数 */
  llmHits: number;
  /** 降级为 other 的数量 */
  fallbacks: number;
  warnings: string[];
}

/** 主分类入口：交易骨架 → 已分类交易 */
export async function classifyTransactions(
  drafts: TransactionDraft[],
): Promise<ClassifyResult> {
  const warnings: string[] = [];
  const transactions: ClassifiedTransaction[] = [];
  const pending: { index: number; draft: TransactionDraft }[] = [];
  let ruleHits = 0;

  // 第一级：规则
  drafts.forEach((draft, index) => {
    const text = `${draft.merchant} ${draft.description} ${draft.rawType}`;
    const hit = classifyByRule(text, draft.direction);
    if (hit && hit.confidence >= 0.6) {
      ruleHits++;
      transactions[index] = toClassified(draft, hit.category, hit.confidence, "rule");
    } else {
      pending.push({ index, draft });
      // 占位，LLM 失败时保留低置信度规则结果或 other
      transactions[index] = toClassified(
        draft,
        hit?.category ?? "other",
        hit?.confidence ?? 0.2,
        "rule",
      );
    }
  });

  // 第二级：LLM 兜底（批量）
  let llmHits = 0;
  if (pending.length > 0) {
    for (let i = 0; i < pending.length; i += LLM_BATCH_SIZE) {
      const batch = pending.slice(i, i + LLM_BATCH_SIZE);
      const result = await withTimeout(classifyBatchWithLlm(batch.map((b) => b.draft)), LLM_TIMEOUT_MS);
      if (!result) {
        warnings.push(`LLM 分类不可用，${batch.length} 条未命中规则的交易按规则兜底处理`);
        continue;
      }
      batch.forEach((b, j) => {
        const cat = result[j];
        if (cat && VALID_CATEGORIES.includes(cat)) {
          llmHits++;
          transactions[b.index] = toClassified(b.draft, cat, 0.8, "llm");
        }
      });
    }
  }

  const fallbacks = transactions.filter((t) => t.confidence <= 0.2).length;
  return { transactions, ruleHits, llmHits, fallbacks, warnings };
}

function toClassified(
  draft: TransactionDraft,
  category: TransactionCategory,
  confidence: number,
  classifiedBy: "rule" | "llm" | "manual",
): ClassifiedTransaction {
  return {
    date: draft.date,
    amount: draft.amount,
    direction: draft.direction,
    category,
    merchant: draft.merchant,
    description: draft.description,
    rawType: draft.rawType,
    source: draft.source,
    confidence,
    classifiedBy,
  };
}

/** LLM 批量分类：返回与输入等长的分类数组 */
async function classifyBatchWithLlm(
  drafts: TransactionDraft[],
): Promise<(TransactionCategory | null)[]> {
  const lines = drafts
    .map(
      (d, i) =>
        `${i + 1}. ${d.direction === "income" ? "收入" : "支出"} ¥${Math.abs(d.amount)} 商户:${d.merchant || "无"} 描述:${d.description || "无"} 类型:${d.rawType || "无"}`,
    )
    .join("\n");

  const messages: AIMessage[] = [
    {
      role: "system",
      content:
        "你是金融交易分类器。将每条交易分类为以下之一：dining(餐饮)/transport(交通)/shopping(购物)/rent(房租房贷)/utilities(生活缴费)/entertainment(娱乐)/medical(医疗)/education(教育)/salary(工资)/bonus(奖金)/investment(投资)/insurance(保险)/loan(贷款还款)/transfer(转账)/other(其他)。只输出 JSON 数组，元素为分类字符串，长度与输入条数一致。",
    },
    { role: "user", content: lines },
  ];

  const response = await aiService.generate(messages, {
    taskType: "analysis",
    temperature: 0,
    maxTokens: 1000,
    responseFormat: "json",
  });

  try {
    const jsonMatch = response.content.match(/\[[\s\S]*\]/);
    const arr = JSON.parse(jsonMatch ? jsonMatch[0] : response.content) as unknown[];
    return drafts.map((_, i) => {
      const v = String(arr[i] ?? "").toLowerCase() as TransactionCategory;
      return VALID_CATEGORIES.includes(v) ? v : null;
    });
  } catch {
    return drafts.map(() => null);
  }
}

export { classifyByRule } from "./rules";
