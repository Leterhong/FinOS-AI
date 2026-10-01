import "server-only";

/** 模型调用用量汇总（按工作区用户过滤，避免跨租户聚合）。 */
import { aiService } from "../gateway/AIService";

export interface UsageSummary {
  calls: number;
  tokens: number;
  avgLatencyMs: number;
  errorRate: number;
}

export function getUsageSummary(userId: string): UsageSummary {
  const logs = aiService.getLogs().filter((entry) => entry.userId === userId);
  const calls = logs.length;
  const tokens = logs.reduce((sum, entry) => sum + (entry.tokens?.totalTokens ?? 0), 0);
  const latency = logs.reduce((sum, entry) => sum + (entry.latencyMs ?? 0), 0);
  const fails = logs.filter((entry) => !entry.success).length;
  return {
    calls,
    tokens,
    avgLatencyMs: calls ? Math.round(latency / calls) : 0,
    errorRate: calls ? Number((fails / calls).toFixed(3)) : 0,
  };
}
