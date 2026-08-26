import { BaseProvider } from "./base";
import type { AIRequest, ModelConfig, TokenUsage } from "../types";

export class ClaudeProvider extends BaseProvider {
  id = "claude" as const;
  defaultModel = "claude-sonnet-4-20250514";
  models: ModelConfig[] = [
    {
      id: "claude-sonnet-4-20250514",
      name: "Claude Sonnet 4",
      provider: "claude",
      contextWindow: 200000,
      maxOutputTokens: 8192,
      capabilities: ["chat", "vision", "function-calling", "streaming", "long-context"],
      strengths: ["long-context", "reasoning", "writing", "analysis"],
      costPer1kInput: 0.003,
      costPer1kOutput: 0.015,
    },
    {
      id: "claude-haiku-4-20250414",
      name: "Claude Haiku 4",
      provider: "claude",
      contextWindow: 200000,
      maxOutputTokens: 8192,
      capabilities: ["chat", "function-calling", "streaming", "long-context"],
      strengths: ["analysis", "extraction"],
      costPer1kInput: 0.0008,
      costPer1kOutput: 0.004,
    },
    {
      id: "claude-opus-4-20250514",
      name: "Claude Opus 4",
      provider: "claude",
      contextWindow: 200000,
      maxOutputTokens: 8192,
      capabilities: ["chat", "vision", "function-calling", "streaming", "long-context"],
      strengths: ["reasoning", "long-context", "analysis"],
      costPer1kInput: 0.015,
      costPer1kOutput: 0.075,
    },
  ];

  protected endpoint = "https://api.anthropic.com/v1/messages";
  protected apiKeyEnv = "ANTHROPIC_API_KEY";
  protected authHeader(apiKey: string): Record<string, string> {
    return { "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
  }

  // Anthropic Messages API shape: system is a top-level field, not a message role.
  protected buildRequestBody(request: AIRequest): unknown {
    const system = request.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n");
    const messages = request.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }));
    return {
      model: request.model ?? this.defaultModel,
      system: system || undefined,
      messages,
      max_tokens: request.maxTokens ?? 4096,
      temperature: request.temperature,
    };
  }

  protected parseContent(data: unknown): string {
    const d = data as { content?: { text?: string }[] };
    return d?.content?.[0]?.text ?? "";
  }

  protected parseUsage(data: unknown): TokenUsage {
    const u = (data as { usage?: { input_tokens?: number; output_tokens?: number } })?.usage;
    const promptTokens = u?.input_tokens ?? 0;
    const completionTokens = u?.output_tokens ?? 0;
    return { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
  }

  async embed(_texts: string[]): Promise<number[][]> {
    void _texts;
    throw new Error(`[${this.id}] embeddings are not supported by this provider.`);
  }
}
