import "server-only";

/**
 * Model Tester（Phase 5.5 五）。
 * 检测：API URL / API Key / 模型响应 / Token 返回，返回成功或失败。
 * 同时提供 Playground（用户输入测试问题 → 调用当前/指定模型 → 展示回复/耗时/Token）。
 */

import { OpenAICompatibleProvider } from "../providers/OpenAICompatibleProvider";
import type { ResolvedModel } from "../providers/OpenAICompatibleProvider";
import { UnsafeBaseUrlError, assertSafeBaseUrl } from "../providers/base-url-guard";
import { modelConfigStore } from "../models/store";
import { resolveModelById, resolveActiveModel } from "../models/resolver";
import { getPreset } from "../providers/presets";
import type {
  ModelTestResult,
  PlaygroundResult,
  ProviderConfigInput,
} from "../types";

const TEST_TIMEOUT_MS = 20000;

function withTimeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(timer) };
}

/** 测试已保存的模型（按 id），并回写状态。 */
export async function testSavedModel(userId: string, id: string): Promise<ModelTestResult> {
  const resolved = await resolveModelById(userId, id);
  if (!resolved) {
    const result: ModelTestResult = {
      ok: false,
      status: "error",
      latencyMs: 0,
      error: "模型配置不完整或 API Key 缺失，无法测试。",
      testedAt: new Date().toISOString(),
    };
    await modelConfigStore.recordTest(userId, id, { status: "error", error: result.error });
    return result;
  }
  const result = await runTest(resolved);
  await modelConfigStore.recordTest(userId, id, {
    status: result.status,
    latencyMs: result.latencyMs,
    error: result.error,
  });
  return result;
}

/** 测试未保存的临时配置（添加弹窗内的「测试连接」）。 */
export async function testDraftModel(input: ProviderConfigInput): Promise<ModelTestResult> {
  const preset = getPreset(input.providerName);
  const baseUrl = (input.baseUrl?.trim() || preset.baseUrl).replace(/\/+$/, "");
  if (!baseUrl) {
    return {
      ok: false,
      status: "error",
      latencyMs: 0,
      error: "缺少 Base URL。",
      testedAt: new Date().toISOString(),
    };
  }
  if (preset.requiresKey && !input.apiKey?.trim()) {
    return {
      ok: false,
      status: "error",
      latencyMs: 0,
      error: "缺少 API Key。",
      testedAt: new Date().toISOString(),
    };
  }
  const resolved: ResolvedModel = {
    providerType: input.providerName,
    baseUrl,
    apiKey: input.apiKey?.trim() ?? "",
    modelId: input.modelId.trim(),
    displayName: input.displayName?.trim() || preset.label,
  };
  return runTest(resolved);
}

function urlErrorResult(message: string): ModelTestResult {
  return {
    ok: false,
    status: "error",
    latencyMs: 0,
    error: message,
    testedAt: new Date().toISOString(),
  };
}

async function runTest(resolved: ResolvedModel): Promise<ModelTestResult> {
  try {
    await assertSafeBaseUrl(resolved.baseUrl);
  } catch (error) {
    if (error instanceof UnsafeBaseUrlError) {
      return urlErrorResult(error.message);
    }
    throw error;
  }
  const { signal, clear } = withTimeoutSignal(TEST_TIMEOUT_MS);
  try {
    const provider = new OpenAICompatibleProvider(resolved);
    return await provider.test(signal);
  } finally {
    clear();
  }
}

/**
 * Playground：用给定问题调用用户当前默认模型（或指定 id）。
 */
export async function runPlayground(
  userId: string,
  question: string,
  modelId?: string
): Promise<PlaygroundResult> {
  const resolved = modelId
    ? await resolveModelById(userId, modelId)
    : await resolveActiveModel(userId);

  if (!resolved) {
    return {
      ok: false,
      reply: "",
      latencyMs: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      model: "",
      provider: "custom",
      error: "尚未配置可用模型，请先在 AI 模型中心添加并设为默认。",
    };
  }

  const { signal, clear } = withTimeoutSignal(TEST_TIMEOUT_MS + 10000);
  try {
    const provider = new OpenAICompatibleProvider(resolved);
    const res = await provider.generate({
      messages: [
        {
          role: "system",
          content: "你是 FinOS AI 的企业经营与风险研判助手。用简体中文专业、审慎地回答，并明确事实、推断和信息缺口；不得虚构企业数据或替代人工决策。",
        },
        { role: "user", content: question },
      ],
      model: resolved.modelId,
      temperature: 0.7,
      maxTokens: 1024,
      signal,
    });
    return {
      ok: true,
      reply: res.content,
      latencyMs: res.latencyMs,
      promptTokens: res.usage.promptTokens,
      completionTokens: res.usage.completionTokens,
      totalTokens: res.usage.totalTokens,
      model: res.model,
      provider: resolved.providerType,
    };
  } catch (err) {
    return {
      ok: false,
      reply: "",
      latencyMs: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      model: resolved.modelId,
      provider: resolved.providerType,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clear();
  }
}
