import "server-only";

/**
 * 模型执行上下文（Phase 5.5 六/八）。
 *
 * 用 AsyncLocalStorage 把当前请求的 userId 透传到 AIService，
 * 使所有 Agent 无需改动签名即可自动走「用户配置的模型」：
 *
 *   Route（runWithModelContext(userId)）
 *     → Agent → aiService.generate()（内部读 ALS 拿 userId）
 *       → resolveActiveModel(userId) → OpenAICompatibleProvider → 用户 LLM
 */

import { AsyncLocalStorage } from "node:async_hooks";

interface ModelContext {
  userId?: string;
}

const storage = new AsyncLocalStorage<ModelContext>();

/** 在给定 userId 上下文中运行 fn（异步）。 */
export function runWithModelContext<T>(userId: string | undefined, fn: () => Promise<T>): Promise<T> {
  return storage.run({ userId }, fn);
}

/** 读取当前上下文的 userId（无则 undefined）。 */
export function getCurrentUserId(): string | undefined {
  return storage.getStore()?.userId;
}
