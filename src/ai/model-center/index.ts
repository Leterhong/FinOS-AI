import "server-only";

/**
 * AI Model Center（Phase 5.5）总出口 —— Model-Agnostic AI Personal CFO 平台核心。
 * FinOS AI 不绑定任何官方模型；用户接入自己的 AI 模型 API，系统负责
 * 管理 / 连接 / 调用 / 切换 / 统一管理。
 */

export * from "./types";
export { encryptApiKey, decryptApiKey, maskApiKey } from "./encryption";
export { PROVIDER_PRESETS, ALL_PRESETS, getPreset } from "./providers/presets";
export { OpenAICompatibleProvider } from "./providers/OpenAICompatibleProvider";
export type { ResolvedModel } from "./providers/OpenAICompatibleProvider";
export { modelConfigStore } from "./models/store";
export {
  resolveActiveModel,
  resolveModelById,
  getActiveModelSummary,
} from "./models/resolver";
export { userModelRouter } from "./router";
export {
  testSavedModel,
  testDraftModel,
  runPlayground,
} from "./tester";
export { getModelHealth } from "./health";
export { runWithModelContext, getCurrentUserId } from "./context";
