// ── AI Model Center 类型 ─────────────────────────────────────────────────
// 纯类型文件（无 server-only），可被客户端与服务端共同 import。
// Phase 5.5：FinOS AI 完全模型无关（Model-Agnostic）——不绑定任何官方模型，
// 用户必须接入自己的 AI 模型 API，系统负责管理/连接/调用/切换/统一管理。

/** 支持的 Provider 类型（均走 OpenAI Compatible API 协议或其变体）。 */
export type ProviderType =
  | "openai"
  | "deepseek"
  | "qwen"
  | "claude"
  | "gemini"
  | "zhipu"
  | "moonshot"
  | "ollama"
  | "custom";

/** 模型连接状态。 */
export type ModelStatus = "untested" | "online" | "offline" | "error";

/** 模型可承担的任务角色（用于 Model Router 任务→模型选择）。 */
export const MODEL_ROLES = ["default", "chat", "reasoning", "vision", "long-context"] as const;
export type ModelRole = typeof MODEL_ROLES[number];

/**
 * 用户 AI 模型配置（Phase 5.5 三）。
 * 注意：apiKey 仅在「传输 / 内存解密后」短暂存在；持久化时只保存 encryptedApiKey。
 */
export interface AIProviderConfig {
  id: string;
  userId: string;
  /** Provider 类型标识（openai/deepseek/...）。 */
  providerName: ProviderType;
  /** 用户自定义显示名（如「我的 DeepSeek」）。 */
  displayName: string;
  /** 模型显示名（如 DeepSeek-V3）。 */
  modelName: string;
  /** 实际调用的 model id（如 deepseek-chat）。 */
  modelId: string;
  /** API Base URL（OpenAI Compatible，如 https://api.deepseek.com/v1）。 */
  baseUrl: string;
  /** 明文 API Key —— 仅出现在写入请求 / 解密后内存中，绝不落盘。 */
  apiKey?: string;
  /** 采样温度（0–1），控制输出随机性。缺省由 AIService 给 0.7。 */
  temperature?: number;
  /** 单次回复最大 Token 数。缺省由 AIService 给 4096。 */
  maxTokens?: number;
  /** 加密后的 API Key —— 持久化字段。 */
  encryptedApiKey?: EncryptedApiKey;
  /** 语义化 provider 类型（与 providerName 一致，保留 spec 字段）。 */
  providerType: ProviderType;
  /** 连接状态。 */
  status: ModelStatus;
  /** 是否为当前默认模型（AI CFO 使用）。 */
  isDefault: boolean;
  /** 任务角色标签，供 Model Router 按任务选模型。 */
  roles?: ModelRole[];
  createdAt: string;
  updatedAt: string;
  /** 最近一次测试时间与延迟。 */
  lastTestedAt?: string;
  lastLatencyMs?: number;
  lastError?: string;
}

/** AES-256-GCM 加密后的 API Key 结构。 */
export interface EncryptedApiKey {
  alg: "aes-256-gcm";
  iv: string;
  tag: string;
  data: string;
}

/**
 * 面向前端的安全视图：不含明文 apiKey / encryptedApiKey，
 * 仅保留掩码后的 keyMask（如 sk-abcd****wxyz）。
 */
export interface PublicProviderConfig {
  id: string;
  userId: string;
  providerName: ProviderType;
  displayName: string;
  modelName: string;
  modelId: string;
  baseUrl: string;
  providerType: ProviderType;
  status: ModelStatus;
  isDefault: boolean;
  roles?: ModelRole[];
  temperature?: number;
  maxTokens?: number;
  keyMask: string;
  createdAt: string;
  updatedAt: string;
  lastTestedAt?: string;
  lastLatencyMs?: number;
  lastError?: string;
}

/** 新增/更新模型的入参（apiKey 可选，更新时留空表示不改）。 */
export interface ProviderConfigInput {
  providerName: ProviderType;
  displayName?: string;
  modelName?: string;
  modelId: string;
  baseUrl?: string;
  apiKey?: string;
  roles?: ModelRole[];
  /** 采样温度（0–1）。 */
  temperature?: number;
  /** 单次回复最大 Token 数。 */
  maxTokens?: number;
}

/** Provider 预设（前端下拉与默认值来源）。 */
export interface ProviderPreset {
  type: ProviderType;
  label: string;
  /** 默认 Base URL（OpenAI Compatible）。 */
  baseUrl: string;
  /** 常见模型 id 建议。 */
  suggestedModels: { id: string; name: string }[];
  /** 是否需要 API Key（Ollama 本地默认不需要）。 */
  requiresKey: boolean;
  /** 文档/获取 Key 地址。 */
  docsUrl?: string;
  /** 简介。 */
  hint?: string;
}

/** 连接测试结果（Phase 5.5 五）。 */
export interface ModelTestResult {
  ok: boolean;
  status: ModelStatus;
  latencyMs: number;
  /** 返回的 Token 数（若可得）。 */
  tokens?: number;
  /** 模型样例回复（截断）。 */
  sampleReply?: string;
  error?: string;
  testedAt: string;
}

/** Playground 运行结果（Phase 5.5 五）。 */
export interface PlaygroundResult {
  ok: boolean;
  reply: string;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  provider: ProviderType;
  error?: string;
}

/** 模型健康状态（Phase 5.5 十）。 */
export interface ModelHealth {
  id: string;
  displayName: string;
  providerType: ProviderType;
  modelId: string;
  status: ModelStatus;
  latencyMs?: number;
  errorRate: number;
  lastCheckedAt?: string;
}

/** 当前激活模型摘要（供 Chat 徽标 / Dashboard AI Brain 卡使用）。 */
export interface ActiveModelSummary {
  configured: boolean;
  id?: string;
  displayName?: string;
  modelName?: string;
  providerType?: ProviderType;
  status?: ModelStatus;
  latencyMs?: number;
  /** 采样温度（0–1）。 */
  temperature?: number;
  /** 单次回复最大 Token 数。 */
  maxTokens?: number;
  /** 用户已配置的模型总数。 */
  totalModels: number;
}

/** Gateway 层无用户模型时抛出的错误码。 */
export const NO_USER_MODEL_CODE = "NO_USER_MODEL";
