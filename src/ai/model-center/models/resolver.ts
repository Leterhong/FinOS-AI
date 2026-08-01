import "server-only";

/**
 * 用户模型解析（Phase 5.5 六）。
 * 把「用户模型配置」解析为可直接调用的 ResolvedModel（含解密后的 apiKey）。
 * AI Gateway 依赖此解析结果构造 OpenAICompatibleProvider。
 */

import { modelConfigStore } from "./store";
import type { ResolvedModel } from "../providers/OpenAICompatibleProvider";
import type { AIProviderConfig, ActiveModelSummary } from "../types";
import { getPreset } from "../providers/presets";

function toResolved(config: AIProviderConfig): ResolvedModel | null {
  const preset = getPreset(config.providerType);
  const apiKey = modelConfigStore.decryptKey(config);
  // 除本地 Ollama 外，均要求 apiKey。
  if (preset.requiresKey && !apiKey) return null;
  if (!config.baseUrl || !config.modelId) return null;
  return {
    providerType: config.providerType,
    baseUrl: config.baseUrl.replace(/\/+$/, ""),
    apiKey,
    modelId: config.modelId,
    displayName: config.displayName,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  };
}

/**
 * 解析用户当前激活模型（默认模型）。
 * @returns ResolvedModel 或 null（未配置 / 配置不完整）。
 */
export async function resolveActiveModel(userId: string): Promise<ResolvedModel | null> {
  const config = await modelConfigStore.getDefaultRaw(userId);
  if (!config) return null;
  return toResolved(config);
}

/** 解析指定 id 的模型（用于 Playground / 指定测试）。 */
export async function resolveModelById(
  userId: string,
  id: string
): Promise<ResolvedModel | null> {
  const config = await modelConfigStore.getRaw(userId, id);
  if (!config) return null;
  return toResolved(config);
}

/** 当前激活模型摘要（Chat 徽标 / Dashboard AI Brain 卡）。 */
export async function getActiveModelSummary(userId: string): Promise<ActiveModelSummary> {
  const total = await modelConfigStore.count(userId);
  const config = await modelConfigStore.getDefaultRaw(userId);
  if (!config) {
    return { configured: false, totalModels: total };
  }
  return {
    configured: true,
    id: config.id,
    displayName: config.displayName,
    modelName: config.modelName,
    providerType: config.providerType,
    status: config.status,
    latencyMs: config.lastLatencyMs,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    totalModels: total,
  };
}
