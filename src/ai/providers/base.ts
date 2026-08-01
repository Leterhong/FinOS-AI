import "server-only";

import type {
  Provider,
  AIRequest,
  AIResponse,
  AIStreamChunk,
  ModelConfig,
  TokenUsage,
  ProviderId,
} from "../types";

/**
 * Real LLM provider base class.
 *
 * Mock logic (generateMock / simulated latency / random embeddings) has been removed.
 * Subclasses supply provider-specific configuration (endpoint, api key env var, auth
 * headers) and, where the provider is not OpenAI-compatible, override the request/response
 * mappers. `generate` performs a real network call. API keys are read from `process.env`
 * and MUST be provided server-side (see architecture audit — a server route is the secure
 * place to invoke this; running it from a client bundle would expose secrets).
 */
export abstract class BaseProvider implements Provider {
  abstract id: ProviderId;
  abstract models: ModelConfig[];
  abstract defaultModel: string;

  // ── Provider-specific real API configuration (subclass fills) ──
  protected abstract endpoint: string;
  protected abstract apiKeyEnv: string;
  protected abstract authHeader(apiKey: string): Record<string, string>;

  // Embedding model id; providers override when they expose an embeddings endpoint.
  protected embedModel?: string;

  // ── OpenAI-compatible defaults. Override for non-OC providers (e.g. Claude). ──
  protected buildRequestBody(request: AIRequest): unknown {
    const body: Record<string, unknown> = {
      model: request.model ?? this.defaultModel,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
    };
    if (request.responseFormat === "json") {
      body.response_format = { type: "json_object" };
    }
    return body;
  }

  protected parseContent(data: unknown): string {
    const d = data as { choices?: { message?: { content?: string } }[] };
    return d?.choices?.[0]?.message?.content ?? "";
  }

  protected parseUsage(data: unknown): TokenUsage {
    // OpenAI-compatible APIs return snake_case usage fields.
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

  async generate(request: AIRequest): Promise<AIResponse> {
    const apiKey = process.env[this.apiKeyEnv];
    if (!apiKey) {
      throw new Error(
        `[${this.id}] API key not configured. Set ${this.apiKeyEnv} (server-side).`
      );
    }

    const startTime = Date.now();
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.authHeader(apiKey) },
      body: JSON.stringify(this.buildRequestBody(request)),
      signal: request.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`[${this.id}] request failed (${res.status}): ${text.slice(0, 300)}`);
    }

    const data = await res.json();
    return {
      content: this.parseContent(data),
      model: request.model ?? this.defaultModel,
      provider: this.id,
      usage: this.parseUsage(data),
      finishReason: "stop",
      latencyMs: Date.now() - startTime,
    };
  }

  async *stream(request: AIRequest): AsyncIterable<AIStreamChunk> {
    // Token-level streaming requires provider-specific SSE handling (Phase 4).
    // For now yield the complete real response as a single chunk.
    const response = await this.generate(request);
    yield { content: response.content, done: true, model: response.model };
  }

  async embed(texts: string[]): Promise<number[][]> {
    const apiKey = process.env[this.apiKeyEnv];
    if (!apiKey) {
      throw new Error(`[${this.id}] API key not configured. Set ${this.apiKeyEnv} (server-side).`);
    }
    const embeddingsUrl = this.endpoint.replace(/\/chat\/completions\/?$/, "/embeddings");
    const res = await fetch(embeddingsUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.authHeader(apiKey) },
      body: JSON.stringify({ model: this.embedModel ?? this.defaultModel, input: texts }),
    });
    if (!res.ok) {
      throw new Error(`[${this.id}] embeddings request failed (${res.status})`);
    }
    const data = await res.json();
    return (data?.data ?? []).map((d: { embedding: number[] }) => d.embedding);
  }
}
