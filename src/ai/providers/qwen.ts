import { BaseProvider } from "./base";
import type { ModelConfig } from "../types";

export class QwenProvider extends BaseProvider {
  id = "qwen" as const;
  defaultModel = "qwen-vl-max";
  models: ModelConfig[] = [
    {
      id: "qwen-vl-max",
      name: "Qwen VL Max",
      provider: "qwen",
      contextWindow: 128000,
      maxOutputTokens: 8192,
      capabilities: ["chat", "vision", "streaming"],
      strengths: ["vision", "analysis"],
      costPer1kInput: 0.0003,
      costPer1kOutput: 0.0006,
    },
    {
      id: "qwen-max",
      name: "Qwen Max",
      provider: "qwen",
      contextWindow: 128000,
      maxOutputTokens: 8192,
      capabilities: ["chat", "function-calling", "streaming"],
      strengths: ["reasoning", "writing"],
      costPer1kInput: 0.0002,
      costPer1kOutput: 0.0006,
    },
  ];

  protected endpoint = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
  protected apiKeyEnv = "QWEN_API_KEY";
  protected authHeader(apiKey: string): Record<string, string> {
    return { Authorization: `Bearer ${apiKey}` };
  }
}
