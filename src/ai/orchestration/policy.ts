/**
 * AI Policy（Phase 6.5 八）—— 调用策略。
 *
 * 简单计算（净资产 / 资产比例 / 储蓄率 / 负债率）一律代码算，禁止调用 LLM；
 * 仅当需要对结果进行「解释 / 归因 / 建议」时才调用 LLM。
 */
import type { FinancialProfile } from "@/data/types";
import { computeRiskMetrics } from "@/scenario/scenario-engine";

const SIMPLE_RE =
  /(净资产|资产比例|储蓄率|负债率|净值|资产配置比例|净worth|net worth|savings rate)/i;

/** 该 query 是否属于「确定性简单计算」（无需 LLM）。 */
export function isSimpleComputation(query: string): boolean {
  return SIMPLE_RE.test(query || "");
}

/** 是否必须调用 LLM 才能回答。 */
export function requiresLLM(query: string): boolean {
  if (isSimpleComputation(query)) return false;
  return true;
}

/** 本地确定性财富健康分（不调 LLM）。测试 5 的底层实现。 */
export function localWealthScore(profile: FinancialProfile): number {
  const m = computeRiskMetrics(profile);
  return m.overall;
}
