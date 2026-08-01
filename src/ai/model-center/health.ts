import "server-only";

/**
 * Model Health Monitor（Phase 5.5 十）。
 * 汇总每个用户模型的连接状态 / 响应时间 / 错误率。
 * 错误率来源：AIService 最近调用日志中 provider="user" 的成败统计
 * （无法区分具体模型 id 时作为整体近似）。
 */

import { modelConfigStore } from "./models/store";
import { aiService } from "../gateway/AIService";
import type { ModelHealth } from "./types";

export async function getModelHealth(userId: string): Promise<ModelHealth[]> {
  const list = await modelConfigStore.list(userId);

  // 近似错误率：统计最近 user 调用的成败。
  const logs = aiService.getLogs().filter((l) => l.provider === "user");
  const fails = logs.filter((l) => !l.success).length;
  const errorRate = logs.length > 0 ? fails / logs.length : 0;

  return list.map((c) => ({
    id: c.id,
    displayName: c.displayName,
    providerType: c.providerType,
    modelId: c.modelId,
    status: c.status,
    latencyMs: c.lastLatencyMs,
    // 仅对已在线的默认模型套用整体错误率，其它保持 0（未参与调用）。
    errorRate: c.status === "online" ? Number(errorRate.toFixed(3)) : 0,
    lastCheckedAt: c.lastTestedAt,
  }));
}
