import "server-only";

import type {
  AIRequest,
  AIResponse,
  AIStreamChunk,
  AIMessage,
  ProviderId,
  TokenUsage,
  TaskType,
} from "../types";
import { getProvider } from "../providers";
import { modelRouter } from "../router/ModelRouter";
// Model Center（Phase 5.5）—— 只 import 具体子模块，避免与 health.ts 形成循环依赖。
import { getCurrentUserId } from "../model-center/context";
import { userModelRouter } from "../model-center/router";
import { resolveActiveModel } from "../model-center/models/resolver";
import { OpenAICompatibleProvider } from "../model-center/providers/OpenAICompatibleProvider";
import { NO_USER_MODEL_CODE } from "../model-center/types";
import { recordUsage } from "../usage/usage-tracker";

/**
 * Structured error for every gateway failure.
 * Carries routing context (requestId / provider / model / taskType) so callers
 * and logs can trace exactly which hop failed.
 */
export class AIError extends Error {
  readonly requestId: string;
  readonly provider?: ProviderId;
  readonly model?: string;
  readonly taskType?: TaskType;
  readonly cause?: unknown;
  /** 错误码。NO_USER_MODEL 表示用户尚未连接任何 AI 模型。 */
  readonly code?: string;

  constructor(
    message: string,
    opts: {
      requestId: string;
      provider?: ProviderId;
      model?: string;
      taskType?: TaskType;
      cause?: unknown;
      code?: string;
    }
  ) {
    super(message);
    this.name = "AIError";
    this.requestId = opts.requestId;
    this.provider = opts.provider;
    this.model = opts.model;
    this.taskType = opts.taskType;
    this.cause = opts.cause;
    this.code = opts.code;
  }
}

interface AIServiceConfig {
  /** Provider used when neither `provider` nor `taskType` is supplied. */
  defaultProvider?: ProviderId;
  defaultModel?: string;
  /** TaskType used to route via ModelRouter when no explicit `provider` is given. */
  defaultTaskType?: TaskType;
  /** Provider used by `embed()` (embeddings are not task-routed). */
  defaultEmbedProvider?: ProviderId;
  maxRetries?: number;
  timeoutMs?: number;
  enableLogging?: boolean;
}

interface LogEntry {
  requestId: string;
  timestamp: number;
  taskType?: TaskType;
  provider: ProviderId;
  model: string;
  latencyMs: number;
  tokens: TokenUsage;
  success: boolean;
  error?: string;
  /** Phase 5.9.1：调用归属用户（来自 ModelContext ALS 或显式 options.userId）。 */
  userId?: string;
  /** Phase 5.9.1：发起调用的智能体中文名（如「退休规划 Agent」）。 */
  agentName?: string;
}

interface GenerateOptions {
  provider?: ProviderId;
  model?: string;
  /** Routes the call through ModelRouter → Provider. This is the preferred path. */
  taskType?: TaskType;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json";
  signal?: AbortSignal;
  /** 显式指定用户（Phase 5.5）。缺省时从 AsyncLocalStorage 读取。 */
  userId?: string;
  /** Phase 5.9.1：发起调用的智能体中文名，用于用量审计（spec #9）。 */
  agentName?: string;
}

interface StreamOptions {
  provider?: ProviderId;
  model?: string;
  taskType?: TaskType;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  userId?: string;
  /** Phase 5.9.1：发起调用的智能体中文名，用于用量审计（spec #9）。 */
  agentName?: string;
}

interface EmbedOptions {
  provider?: ProviderId;
  model?: string;
  userId?: string;
  /** Phase 5.9.1：发起调用的智能体中文名，用于用量审计（spec #9）。 */
  agentName?: string;
}

/** 执行 Provider 解析结果。 */
interface ExecutionTarget {
  provider: {
    generate(request: AIRequest): Promise<AIResponse>;
    stream?(request: AIRequest): AsyncIterable<AIStreamChunk>;
    embed?(texts: string[]): Promise<number[][]>;
  };
  model: string;
  providerId: ProviderId;
  source: "user" | "system";
  /** 用户模型配置的温度 / maxTokens（仅 user 来源），作为请求默认值。 */
  temperature?: number;
  maxTokens?: number;
}

function newRequestId(): string {
  return `ai_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Unified LLM gateway.
 *
 * Call chain (mandatory):
 *   Agent → AIService → ModelRouter → Provider → LLM
 *
 * Agents MUST NOT call a model or a provider directly; they only call
 * `aiService.generate/stream/embed` with a `taskType`. The gateway resolves the
 * optimal provider+model via ModelRouter, applies timeout / retry / logging, and
 * returns real LLM output. API keys are read from `process.env` server-side only.
 */
class AIService {
  private config: Required<AIServiceConfig>;
  private logs: LogEntry[] = [];
  private totalTokens: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

  constructor(config: AIServiceConfig = {}) {
    this.config = {
      defaultProvider: config.defaultProvider ?? "openai",
      defaultModel: config.defaultModel ?? "gpt-4o",
      defaultTaskType: config.defaultTaskType ?? "analysis",
      defaultEmbedProvider: config.defaultEmbedProvider ?? "openai",
      maxRetries: config.maxRetries ?? 2,
      timeoutMs: config.timeoutMs ?? 30000,
      enableLogging: config.enableLogging ?? true,
    };
  }

  /**
   * Resolve provider + model for a request.
   *
   * Precedence:
   *   1. Explicit `provider` (with optional `model`) — caller override wins.
   *   2. `taskType` → ModelRouter (the standard Agent → AIService → ModelRouter path).
   *   3. Configured `defaultTaskType` → ModelRouter.
   *   4. Configured `defaultProvider` / `defaultModel`.
   */
  private resolveRoute(opts: {
    provider?: ProviderId;
    model?: string;
    taskType?: TaskType;
  }): { provider: ProviderId; model: string; taskType?: TaskType } {
    if (opts.provider) {
      return {
        provider: opts.provider,
        model: opts.model ?? this.config.defaultModel,
        taskType: opts.taskType,
      };
    }
    const taskType = opts.taskType ?? this.config.defaultTaskType;
    if (taskType) {
      const decision = modelRouter.route(taskType);
      return {
        provider: decision.provider,
        model: opts.model ?? decision.model,
        taskType,
      };
    }
    return {
      provider: this.config.defaultProvider,
      model: opts.model ?? this.config.defaultModel,
    };
  }

  /**
   * 解析本次调用的执行 Provider（Phase 5.5 核心）。
   *
   * Model-Agnostic 规则：
   *   - 若存在用户上下文（options.userId 或 ALS）：必须使用「用户配置的模型」。
   *     解析成功 → 动态 OpenAICompatibleProvider（provider="user"）。
   *     用户在场但未配置任何可用模型 → 抛 NO_USER_MODEL（不回退官方模型）。
   *   - 若无用户上下文（内部/系统调用，如 RAG 向量化）：回退到内置 env Provider，
   *     以保证与用户无关的系统功能可用。
   *   - 若调用方显式指定 provider（override），仍走 env Provider（内部诊断/测试用途）。
   */
  private async resolveExecution(
    requestId: string,
    route: { provider: ProviderId; model: string; taskType?: TaskType },
    options: { provider?: ProviderId; userId?: string }
  ): Promise<ExecutionTarget> {
    const userId = options.userId ?? getCurrentUserId();

    if (userId && !options.provider) {
      const resolved =
        (await userModelRouter.route(userId, route.taskType)) ??
        (await resolveActiveModel(userId));
      if (!resolved) {
        throw new AIError(
          "尚未连接任何 AI 模型。请先前往「AI 模型中心」添加并测试你的模型 API。",
          { requestId, code: NO_USER_MODEL_CODE, taskType: route.taskType }
        );
      }
      return {
        provider: new OpenAICompatibleProvider(resolved),
        model: resolved.modelId,
        providerId: "user",
        source: "user",
        temperature: resolved.temperature,
        maxTokens: resolved.maxTokens,
      };
    }

    // 内部/系统调用回退（无 userId 上下文）。
    return {
      provider: getProvider(route.provider),
      model: route.model,
      providerId: route.provider,
      source: "system",
    };
  }

  /**
   * Generate a complete response. All agent/model calls MUST go through here.
   */
  async generate(messages: AIMessage[], options: GenerateOptions = {}): Promise<AIResponse> {
    const requestId = newRequestId();
    const route = this.resolveRoute(options);
    const target = await this.resolveExecution(requestId, route, options);

    const request: AIRequest = {
      messages,
      model: target.model,
      temperature: options.temperature ?? target.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? target.maxTokens ?? 4096,
      stream: false,
      responseFormat: options.responseFormat ?? "text",
      signal: options.signal,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await this.withTimeout(
          target.provider.generate(request),
          this.config.timeoutMs,
          options.signal
        );

        this.logCall({
          requestId,
          taskType: route.taskType,
          provider: target.providerId,
          model: response.model,
          latencyMs: response.latencyMs,
          tokens: response.usage,
          success: true,
          agentName: options.agentName,
        });

        return response;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (options.signal?.aborted) break;

        // Exponential backoff (capped), then retry.
        if (attempt < this.config.maxRetries) {
          const backoff = Math.min(2 ** attempt * 500, 8000);
          await this.sleep(backoff, options.signal);
        }
      }
    }

    this.logCall({
      requestId,
      taskType: route.taskType,
      provider: target.providerId,
      model: target.model,
      latencyMs: 0,
      tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      success: false,
      error: lastError?.message,
      agentName: options.agentName,
    });

    throw new AIError(
      `AI generation failed after ${this.config.maxRetries + 1} attempt(s) ` +
        `[task=${route.taskType ?? "none"}, provider=${target.providerId}, model=${target.model}]: ` +
        `${lastError?.message ?? "unknown error"}`,
      {
        requestId,
        provider: target.providerId,
        model: target.model,
        taskType: route.taskType,
        cause: lastError,
      }
    );
  }

  /**
   * Stream a response. Falls back to yielding the full `generate` result as a
   * single chunk when the provider does not implement token-level streaming.
   */
  async *stream(messages: AIMessage[], options: StreamOptions = {}): AsyncIterable<AIStreamChunk> {
    const requestId = newRequestId();
    const route = this.resolveRoute(options);
    const target = await this.resolveExecution(requestId, route, options);

    const request: AIRequest = {
      messages,
      model: target.model,
      temperature: options.temperature ?? target.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? target.maxTokens,
      stream: true,
      signal: options.signal,
    };

    if (!target.provider.stream) {
      const response = await this.generate(messages, options);
      yield { content: response.content, done: true, model: response.model };
      return;
    }

    try {
      yield* target.provider.stream(request);
      this.logCall({
        requestId,
        taskType: route.taskType,
        provider: target.providerId,
        model: target.model,
        latencyMs: 0,
        tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        success: true,
        agentName: options.agentName,
      });
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      this.logCall({
        requestId,
        taskType: route.taskType,
        provider: target.providerId,
        model: target.model,
        latencyMs: 0,
        tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        success: false,
        error: e.message,
        agentName: options.agentName,
      });
      throw new AIError(
        `AI stream failed [task=${route.taskType ?? "none"}, provider=${target.providerId}]: ${e.message}`,
        {
          requestId,
          provider: target.providerId,
          model: target.model,
          taskType: route.taskType,
          cause: e,
        }
      );
    }
  }

  /**
   * Generate embeddings via the configured embedding provider (not task-routed).
   */
  async embed(texts: string[], options: EmbedOptions = {}): Promise<number[][]> {
    const requestId = newRequestId();
    const providerId = options.provider ?? this.config.defaultEmbedProvider;
    const provider = getProvider(providerId);

    if (!provider.embed) {
      throw new AIError(`Provider ${providerId} does not support embeddings`, {
        requestId,
        provider: providerId,
      });
    }

    try {
      const vectors = await provider.embed(texts);
      this.logCall({
        requestId,
        provider: providerId,
        model: options.model ?? "embedding",
        latencyMs: 0,
        tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        success: true,
        agentName: options.agentName,
      });
      return vectors;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      this.logCall({
        requestId,
        provider: providerId,
        model: options.model ?? "embedding",
        latencyMs: 0,
        tokens: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        success: false,
        error: e.message,
        agentName: options.agentName,
      });
      throw new AIError(`Embedding failed [provider=${providerId}]: ${e.message}`, {
        requestId,
        provider: providerId,
        cause: e,
      });
    }
  }

  /**
   * Shortcut: system + user prompt → response text.
   */
  async quickGenerate(
    systemPrompt: string,
    userPrompt: string,
    options: GenerateOptions = {}
  ): Promise<string> {
    const response = await this.generate(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      options
    );
    return response.content;
  }

  // ── Configuration ──────────────────────────────────────────────────────

  setDefaultProvider(provider: ProviderId) {
    this.config.defaultProvider = provider;
  }

  setDefaultModel(model: string) {
    this.config.defaultModel = model;
  }

  setDefaultTaskType(taskType: TaskType) {
    this.config.defaultTaskType = taskType;
  }

  // ── Observability ──────────────────────────────────────────────────────

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  getTotalUsage(): TokenUsage {
    return { ...this.totalTokens };
  }

  clearLogs() {
    this.logs = [];
  }

  // ── Internal ───────────────────────────────────────────────────────────

  private async withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    signal?: AbortSignal
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`AI request timed out after ${ms}ms`)), ms);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new Error("AI request aborted"));
      };

      if (signal) {
        if (signal.aborted) {
          clearTimeout(timer);
          return reject(new Error("AI request aborted"));
        }
        signal.addEventListener("abort", onAbort, { once: true });
      }

      promise.then(
        (result) => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
          resolve(result);
        },
        (err) => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
          reject(err);
        }
      );
    });
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(new Error("AI request aborted"));
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new Error("AI request aborted"));
        },
        { once: true }
      );
    });
  }

  private logCall(params: {
    requestId: string;
    taskType?: TaskType;
    provider: ProviderId;
    model: string;
    latencyMs: number;
    tokens: TokenUsage;
    success: boolean;
    error?: string;
    /** Phase 5.9.1：发起调用的智能体中文名（来自 GenerateOptions.agentName）。 */
    agentName?: string;
  }) {
    const userId = getCurrentUserId();
    const fullEntry: LogEntry = {
      requestId: params.requestId,
      timestamp: Date.now(),
      taskType: params.taskType,
      provider: params.provider,
      model: params.model,
      latencyMs: params.latencyMs,
      tokens: params.tokens,
      success: params.success,
      error: params.error,
      userId,
      agentName: params.agentName,
    };
    if (this.config.enableLogging) {
      this.logs.push(fullEntry);
      // Keep only the last 100 entries.
      if (this.logs.length > 100) this.logs.shift();
    }
    if (params.success) {
      this.totalTokens.promptTokens += params.tokens.promptTokens;
      this.totalTokens.completionTokens += params.tokens.completionTokens;
      this.totalTokens.totalTokens += params.tokens.totalTokens;
    }
    if (process.env.NODE_ENV === "development") {
      console.log(
        `[AI] ${params.taskType ? params.taskType + " → " : ""}${params.provider}/${params.model} · ` +
          `${params.latencyMs}ms · ${params.tokens.totalTokens} tok · ${params.success ? "OK" : "FAIL " + (params.error ?? "")}`
      );
    }
    // Phase 5.9.1 / spec #9：持久化用量审计（user_id / agent / model / tokens / time / cost）
    if (userId) {
      void recordUsage({
        userId,
        agentName: params.agentName,
        provider: params.provider,
        model: params.model,
        taskType: params.taskType,
        promptTokens: params.tokens.promptTokens,
        completionTokens: params.tokens.completionTokens,
        totalTokens: params.tokens.totalTokens,
        latencyMs: params.latencyMs,
        success: params.success,
        error: params.error,
      });
    }
  }
}

// Singleton instance — the single entry point all agents use.
export const aiService = new AIService();
export type { LogEntry as AILogEntry };
export { AIService };
