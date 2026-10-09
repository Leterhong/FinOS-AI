import "server-only";

import { PROVIDER_PRESETS } from "../providers/presets";
import type { ResolvedModel } from "../providers/OpenAICompatibleProvider";
import type { ActiveModelSummary, ProviderType } from "../types";

/**
 * 全站共享默认模型（服务端配置）。
 *
 * 目标：让未自行配置模型的访客也能体验 AI 能力。
 * 安全：API Key 仅从服务端环境变量读取，绝不下发浏览器；返回给前端的只是掩码摘要。
 * 配置（全部为服务端环境变量）：
 *   AI_BASE_URL / AI_MODEL / AI_API_KEY  必填
 *   AI_PROVIDER（默认 custom）、AI_DISPLAY_NAME、AI_MAX_TOKENS、AI_TEMPERATURE 可选
 *   AI_SHARED_MODEL=0 可关闭共享
 */

export interface SystemModelConfig {
  providerType: ProviderType;
  baseUrl: string;
  modelId: string;
  apiKey: string;
  displayName: string;
  temperature?: number;
  maxTokens?: number;
}

const PROVIDER_TYPES = Object.keys(PROVIDER_PRESETS) as ProviderType[];
const DISABLED = new Set(["0", "false", "no", "off"]);

/** 从环境变量解析共享模型配置；缺项或显式关闭时返回 null。 */
export function readSystemModelConfig(env: Record<string, string | undefined> = process.env): SystemModelConfig | null {
  if (DISABLED.has((env.AI_SHARED_MODEL ?? "1").trim().toLowerCase())) return null;
  const baseUrl = (env.AI_BASE_URL ?? "").trim().replace(/\/+$/, "");
  const modelId = (env.AI_MODEL ?? "").trim();
  const apiKey = (env.AI_API_KEY ?? "").trim();
  if (!baseUrl || !modelId || !apiKey) return null;

  const providerRaw = (env.AI_PROVIDER ?? "custom").trim() as ProviderType;
  const providerType = PROVIDER_TYPES.includes(providerRaw) ? providerRaw : "custom";
  const temperatureRaw = (env.AI_TEMPERATURE ?? "").trim();
  const temperatureNum = temperatureRaw ? Number(temperatureRaw) : Number.NaN;
  const maxTokensNum = Number(env.AI_MAX_TOKENS ?? "2048");
  return {
    providerType,
    baseUrl,
    modelId,
    apiKey,
    displayName: (env.AI_DISPLAY_NAME ?? "").trim() || `${modelId}（全站默认）`,
    temperature: Number.isFinite(temperatureNum) ? temperatureNum : undefined,
    maxTokens: Number.isFinite(maxTokensNum) && maxTokensNum > 0 ? maxTokensNum : undefined,
  };
}

/** 解析为可直接调用的模型；shared=true 供路由限流判断。 */
export function getSystemModel(): ResolvedModel | null {
  const config = readSystemModelConfig();
  if (!config) return null;
  return {
    providerType: config.providerType,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    modelId: config.modelId,
    displayName: config.displayName,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    shared: true,
  };
}

/** 前端可见的摘要（不含密钥）。 */
export function getSystemModelSummary(): ActiveModelSummary | null {
  const config = readSystemModelConfig();
  if (!config) return null;
  return {
    configured: true,
    id: "system:shared",
    displayName: config.displayName,
    modelName: config.modelId,
    providerType: config.providerType,
    status: "online",
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    totalModels: 0,
  };
}

/** 共享模型是否启用（用于前端提示）。 */
export function isSharedModelEnabled(): boolean {
  return readSystemModelConfig() !== null;
}
