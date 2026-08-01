import { BaseProvider } from "./base";
import type { ModelConfig } from "../types";

export class SeedProvider extends BaseProvider {
  id = "seed" as const;
  defaultModel = "doubao-seed-evolving";
  models: ModelConfig[] = [
    {
      id: "doubao-seed-evolving",
      name: "Doubao Seed Evolving",
      provider: "seed",
      contextWindow: 128000,
      maxOutputTokens: 8192,
      capabilities: ["chat", "function-calling", "streaming", "json-mode"],
      strengths: ["reasoning", "analysis", "writing"],
      costPer1kInput: 0.0001,
      costPer1kOutput: 0.0003,
    },
    {
      id: "doubao-1.5-pro",
      name: "Doubao 1.5 Pro",
      provider: "seed",
      contextWindow: 256000,
      maxOutputTokens: 12288,
      capabilities: ["chat", "vision", "function-calling", "streaming", "long-context"],
      strengths: ["long-context", "vision", "reasoning"],
      costPer1kInput: 0.0008,
      costPer1kOutput: 0.002,
    },
  ];

  protected endpoint = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
  protected apiKeyEnv = "SEED_API_KEY";
  protected authHeader(apiKey: string): Record<string, string> {
    return { Authorization: `Bearer ${apiKey}` };
  }
}
