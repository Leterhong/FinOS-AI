import { BaseProvider } from "./base";
import type { ModelConfig } from "../types";

export class OpenAIProvider extends BaseProvider {
  id = "openai" as const;
  defaultModel = "gpt-4o";
  models: ModelConfig[] = [
    {
      id: "gpt-4o",
      name: "GPT-4o",
      provider: "openai",
      contextWindow: 128000,
      maxOutputTokens: 4096,
      capabilities: ["chat", "vision", "function-calling", "streaming", "json-mode"],
      strengths: ["writing", "analysis", "summarization", "extraction"],
      costPer1kInput: 0.005,
      costPer1kOutput: 0.015,
    },
    {
      id: "gpt-4o-mini",
      name: "GPT-4o Mini",
      provider: "openai",
      contextWindow: 128000,
      maxOutputTokens: 4096,
      capabilities: ["chat", "function-calling", "streaming"],
      strengths: ["analysis", "extraction"],
      costPer1kInput: 0.00015,
      costPer1kOutput: 0.0006,
    },
  ];

  protected endpoint = "https://api.openai.com/v1/chat/completions";
  protected apiKeyEnv = "OPENAI_API_KEY";
  protected authHeader(apiKey: string): Record<string, string> {
    return { Authorization: `Bearer ${apiKey}` };
  }

  protected embedModel = "text-embedding-3-small";
}
