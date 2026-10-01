import "server-only";

/** 模型调用用量汇总（按工作区用户过滤，避免跨租户聚合）。 */
import { aiService } from "../gateway/AIService";
import { modelConfigStore } from "./models/store";

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

export async function getUsageSummary(userId: string): Promise<UsageSummary> {
  const [configs, logs] = await Promise.all([
    modelConfigStore.list(userId),
    Promise.resolve(aiService.getLogs().filter((entry) => entry.userId === userId)),
  ]);
  const priceByModel = new Map<string, { input: number; output: number }>();
  for (const config of configs) {
    if (config.inputPricePerMillion == null && config.outputPricePerMillion == null) continue;
    const price = { input: config.inputPricePerMillion ?? 0, output: config.outputPricePerMillion ?? 0 };
    priceByModel.set(config.modelId, price);
    priceByModel.set(config.modelName, price);
  }
  const calls = logs.length;
  const tokens = logs.reduce((sum, entry) => sum + (entry.tokens?.totalTokens ?? 0), 0);
  const latency = logs.reduce((sum, entry) => sum + (entry.latencyMs ?? 0), 0);
  const fails = logs.filter((entry) => !entry.success).length;
  let estimatedCost = 0;
  let pricedCalls = 0;
  for (const entry of logs) {
    const price = priceByModel.get(entry.model);
    if (!price) continue;
    pricedCalls += 1;
    estimatedCost += ((entry.tokens?.promptTokens ?? 0) * price.input + (entry.tokens?.completionTokens ?? 0) * price.output) / 1_000_000;
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
