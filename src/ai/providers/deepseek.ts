import { BaseProvider } from "./base";
import type { ModelConfig } from "../types";

export class DeepSeekProvider extends BaseProvider {
  id = "deepseek" as const;
  defaultModel = "deepseek-reasoner";
  models: ModelConfig[] = [
    {
      id: "deepseek-reasoner",
      name: "DeepSeek R1",
      provider: "deepseek",
      contextWindow: 64000,
      maxOutputTokens: 8192,
      capabilities: ["chat", "function-calling", "streaming", "json-mode"],
      strengths: ["reasoning", "planning", "analysis"],
      costPer1kInput: 0.0003,
      costPer1kOutput: 0.0007,
    },
    {
      id: "deepseek-chat",
      name: "DeepSeek V3",
      provider: "deepseek",
      contextWindow: 64000,
      maxOutputTokens: 4096,
      capabilities: ["chat", "function-calling", "streaming"],
      strengths: ["analysis", "summarization"],
      costPer1kInput: 0.0001,
      costPer1kOutput: 0.0002,
    },
  ];

  protected endpoint = "https://api.deepseek.com/v1/chat/completions";
  protected apiKeyEnv = "DEEPSEEK_API_KEY";
  protected authHeader(apiKey: string): Record<string, string> {
    return { Authorization: `Bearer ${apiKey}` };
  }
}
