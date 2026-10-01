import "server-only";

/** 模型调用用量汇总（按工作区用户过滤，避免跨租户聚合）。 */
import { aiService } from "../gateway/AIService";
import { modelConfigStore } from "./models/store";
import { listUsage } from "../usage/usage-tracker";

export interface UsageSummary {
  calls: number;
  tokens: number;
  avgLatencyMs: number;
  errorRate: number;
  /** 已配置单价并据此估算的费用（美元）。 */
  estimatedCost: number;
  /** 参与费用估算的调用数；与 calls 不一致说明部分模型未配置单价。 */
  pricedCalls: number;
}

interface UsageLike {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  success: boolean;
}

export async function getUsageSummary(userId: string): Promise<UsageSummary> {
  const configs = await modelConfigStore.list(userId);
  const priceByModel = new Map<string, { input: number; output: number }>();
  for (const config of configs) {
    if (config.inputPricePerMillion == null && config.outputPricePerMillion == null) continue;
    const price = { input: config.inputPricePerMillion ?? 0, output: config.outputPricePerMillion ?? 0 };
    priceByModel.set(config.modelId, price);
    priceByModel.set(config.modelName, price);
  }

  // 优先使用持久化用量（重启不清零、超过内存 100 条上限）；无记录时退回进程内日志。
  const persisted = await listUsage(userId);
  const records: UsageLike[] = persisted.length
    ? persisted.map((r) => ({
        model: r.model ?? "",
        promptTokens: r.promptTokens ?? 0,
        completionTokens: r.completionTokens ?? 0,
        totalTokens: r.totalTokens ?? 0,
        latencyMs: r.latencyMs ?? 0,
        success: r.success !== false,
      }))
    : aiService.getLogs().filter((entry) => entry.userId === userId).map((entry) => ({
        model: entry.model,
        promptTokens: entry.tokens?.promptTokens ?? 0,
        completionTokens: entry.tokens?.completionTokens ?? 0,
        totalTokens: entry.tokens?.totalTokens ?? 0,
        latencyMs: entry.latencyMs ?? 0,
        success: entry.success,
      }));

  const calls = records.length;
  const tokens = records.reduce((sum, entry) => sum + entry.totalTokens, 0);
  const latency = records.reduce((sum, entry) => sum + entry.latencyMs, 0);
  const fails = records.filter((entry) => !entry.success).length;
  let estimatedCost = 0;
  let pricedCalls = 0;
  for (const entry of records) {
    const price = priceByModel.get(entry.model);
    if (!price) continue;
    pricedCalls += 1;
    estimatedCost += (entry.promptTokens * price.input + entry.completionTokens * price.output) / 1_000_000;
  }
  return {
    calls,
    tokens,
    avgLatencyMs: calls ? Math.round(latency / calls) : 0,
    errorRate: calls ? Number((fails / calls).toFixed(3)) : 0,
    estimatedCost: Number(estimatedCost.toFixed(4)),
    pricedCalls,
  };
}
