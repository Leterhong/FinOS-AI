import "server-only";

/**
 * OpenAI Compatible Provider Adapter（Phase 5.5 七）。
 *
 * 统一接口：chat() / stream() / embed() / test()，实现 core Provider 契约
 * （generate/stream/embed），供 AIService 直接驱动。与内置 env-Provider 不同，
 * 本 Adapter 的 baseUrl / apiKey / modelId 全部来自「用户模型配置」（运行时注入），
 * 不读取任何 process.env —— 这是 Model-Agnostic 架构的核心。
 *
 * 绝大多数 Provider（OpenAI/DeepSeek/Qwen/Gemini/智谱/Moonshot/Ollama/Custom）
 * 均使用标准 /chat/completions 协议；Claude 官方 messages 协议在此做最小适配
 * （当 baseUrl 指向 anthropic 官方域名时）。
 */

import type {
  AIRequest,
  AIResponse,
  AIStreamChunk,
  TokenUsage,
} from "../../types";
import type { AIProviderConfig, ModelTestResult, ProviderType } from "../types";

export interface ResolvedModel {
  providerType: ProviderType;
  baseUrl: string;
  apiKey: string;
  modelId: string;
  displayName: string;
  /** 用户配置的采样温度（0–1），作为请求未显式指定时的默认值。 */
  temperature?: number;
  /** 用户配置的最大 Token 数，作为请求未显式指定时的默认值。 */
  maxTokens?: number;
}

function toResolved(config: AIProviderConfig, apiKey: string): ResolvedModel {
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

export class OpenAICompatibleProvider {
  readonly id = "user" as const;
  private m: ResolvedModel;

  constructor(input: ResolvedModel | { config: AIProviderConfig; apiKey: string }) {
    this.m =
      "config" in input ? toResolved(input.config, input.apiKey) : input;
  }

  /** 是否为 Anthropic 官方 messages 协议（需要单独适配）。 */
  private get isAnthropic(): boolean {
    return (
      this.m.providerType === "claude" &&
      /anthropic\.com/.test(this.m.baseUrl)
    );
  }

  private chatUrl(): string {
    return this.isAnthropic
      ? `${this.m.baseUrl}/messages`
      : `${this.m.baseUrl}/chat/completions`;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.isAnthropic) {
      h["x-api-key"] = this.m.apiKey;
      h["anthropic-version"] = "2023-06-01";
    } else if (this.m.apiKey) {
      h["Authorization"] = `Bearer ${this.m.apiKey}`;
    }
    return h;
  }

  /** OpenAI 协议消息体：有 parts（多模态图片+文本）时优先发送 parts。 */
  private toOpenAIMessage(msg: AIRequest["messages"][number]): unknown {
    if (msg.parts?.length) {
      return { role: msg.role, content: msg.parts };
    }
    return { role: msg.role, content: msg.content };
  }

  /** Anthropic 协议消息体：image_url(data URL) → base64 source 块。 */
  private toAnthropicMessage(msg: AIRequest["messages"][number]): unknown {
    if (!msg.parts?.length) return { role: msg.role, content: msg.content };
    const content = msg.parts.map((p) => {
      if (p.type === "text") return { type: "text", text: p.text };
      const m = /^data:([^;]+);base64,(.+)$/.exec(p.image_url.url);
      if (m) {
        return {
          type: "image",
          source: { type: "base64", media_type: m[1], data: m[2] },
        };
      }
      return { type: "image", source: { type: "url", url: p.image_url.url } };
    });
    return { role: msg.role, content };
  }

  private body(request: AIRequest, stream: boolean): unknown {
    if (this.isAnthropic) {
      const system = request.messages
        .filter((msg) => msg.role === "system")
        .map((msg) => msg.content)
        .join("\n");
      const messages = request.messages
        .filter((msg) => msg.role !== "system")
        .map((msg) => this.toAnthropicMessage(msg));
      return {
        model: request.model ?? this.m.modelId,
        system: system || undefined,
        messages,
        max_tokens: request.maxTokens ?? this.m.maxTokens ?? 4096,
        temperature: request.temperature ?? this.m.temperature,
        stream,
      };
    }
    const b: Record<string, unknown> = {
      model: request.model ?? this.m.modelId,
      messages: request.messages.map((msg) => this.toOpenAIMessage(msg)),
      temperature: request.temperature ?? this.m.temperature,
      max_tokens: request.maxTokens ?? this.m.maxTokens,
      stream,
    };
    if (request.responseFormat === "json") {
      b.response_format = { type: "json_object" };
    }
    return b;
  }

  private parseContent(data: unknown): string {
    if (this.isAnthropic) {
      const d = data as { content?: { text?: string }[] };
      return d?.content?.map((c) => c.text ?? "").join("") ?? "";
    }
    const d = data as { choices?: { message?: { content?: string } }[] };
    return d?.choices?.[0]?.message?.content ?? "";
  }

  private parseUsage(data: unknown): TokenUsage {
    if (this.isAnthropic) {
      const u = (data as { usage?: { input_tokens?: number; output_tokens?: number } })?.usage;
      const promptTokens = u?.input_tokens ?? 0;
      const completionTokens = u?.output_tokens ?? 0;
      return { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
    }
    const u = (data as {
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    })?.usage;
    const promptTokens = u?.prompt_tokens ?? 0;
    const completionTokens = u?.completion_tokens ?? 0;
    return {
      promptTokens,
      completionTokens,
      totalTokens: u?.total_tokens ?? promptTokens + completionTokens,
    };
  }

  // ── core Provider 契约 ──────────────────────────────────────────────────

  async generate(request: AIRequest): Promise<AIResponse> {
    const start = Date.now();
    const res = await fetch(this.chatUrl(), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(this.body(request, false)),
      signal: request.signal,
      // 禁止自动重定向：防止公网地址 30x 跳转内网绕过 Base URL 校验。
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400) {
      throw new Error(`[user:${this.m.providerType}] 请求被重定向（不允许），状态码 ${res.status}`);
    }
    if (!res.ok) {
      // 不回显上游响应体：错误信息可能反射内部服务内容（SSRF 探测 oracle）。
      throw new Error(`[user:${this.m.providerType}] 请求失败 (${res.status})`);
    }
    const data = await res.json();
    return {
      content: this.parseContent(data),
      model: request.model ?? this.m.modelId,
      provider: "user",
      usage: this.parseUsage(data),
      finishReason: "stop",
      latencyMs: Date.now() - start,
    };
  }

  /** SSE 流式（OpenAI 兼容）；非 OC 协议降级为整段返回。 */
  async *stream(request: AIRequest): AsyncIterable<AIStreamChunk> {
    if (this.isAnthropic) {
      const response = await this.generate(request);
      yield { content: response.content, done: true, model: response.model };
      return;
    }
    const res = await fetch(this.chatUrl(), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(this.body(request, true)),
      signal: request.signal,
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400) {
      throw new Error(`[user:${this.m.providerType}] 请求被重定向（不允许），状态码 ${res.status}`);
    }
    if (!res.ok || !res.body) {
      throw new Error(`[user:${this.m.providerType}] 流式请求失败 (${res.status})`);
    }
    // 部分 OpenAI 兼容网关会忽略 stream=true，并直接返回普通 JSON。
    // 若继续按 SSE 解析会静默得到空回复，因此在这里可靠降级为整段输出。
    const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/event-stream")) {
      const data = await res.json();
      const content = this.parseContent(data);
      if (!content) {
        throw new Error(`[user:${this.m.providerType}] 模型返回了空内容`);
      }
      yield { content, done: true, model: request.model ?? this.m.modelId };
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const model = request.model ?? this.m.modelId;
    let receivedContent = false;
    const parseLine = (line: string): AIStreamChunk | null => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) return null;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return { content: "", done: true, model };
      try {
        const json = JSON.parse(payload) as {
          choices?: { delta?: { content?: string }; message?: { content?: string } }[];
        };
        const content = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content;
        return content ? { content, done: false, model } : null;
      } catch {
        return null;
      }
    };
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const chunk = parseLine(line);
        if (!chunk) continue;
        if (chunk.done) return;
        receivedContent = true;
        yield chunk;
      }
    }
    if (buffer.trim()) {
      const chunk = parseLine(buffer);
      if (chunk && !chunk.done) {
        receivedContent = true;
        yield chunk;
      }
    }
    if (!receivedContent) {
      throw new Error(`[user:${this.m.providerType}] 流式响应中没有可用内容`);
    }
    yield { content: "", done: true, model };
  }

  async embed(texts: string[]): Promise<number[][]> {
    const url = `${this.m.baseUrl}/embeddings`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ model: this.m.modelId, input: texts }),
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400) {
      throw new Error(`[user:${this.m.providerType}] 请求被重定向（不允许），状态码 ${res.status}`);
    }
    if (!res.ok) {
      throw new Error(`[user:${this.m.providerType}] embeddings 失败 (${res.status})`);
    }
    const data = await res.json();
    return (data?.data ?? []).map((d: { embedding: number[] }) => d.embedding);
  }

  /**
   * 连接测试（Phase 5.5 五）：发送最小 chat 请求，返回结构化结果。
   */
  async test(signal?: AbortSignal): Promise<ModelTestResult> {
    const start = Date.now();
    try {
      const res = await this.generate({
        messages: [
          { role: "user", content: "ping，请只回复两个字：正常" },
        ],
        model: this.m.modelId,
        temperature: 0,
        maxTokens: 16,
        signal,
      });
      const latencyMs = Date.now() - start;
      return {
        ok: true,
        status: "online",
        latencyMs,
        tokens: res.usage.totalTokens,
        sampleReply: res.content.slice(0, 60),
        testedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        ok: false,
        status: "error",
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
        testedAt: new Date().toISOString(),
      };
    }
  }
}
