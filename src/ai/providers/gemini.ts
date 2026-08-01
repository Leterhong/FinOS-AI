import { BaseProvider } from "./base";
import type { ModelConfig } from "../types";

export class GeminiProvider extends BaseProvider {
  id = "gemini" as const;
  defaultModel = "gemini-2.0-flash";
  models: ModelConfig[] = [
    {
      id: "gemini-2.0-flash",
      name: "Gemini 2.0 Flash",
      provider: "gemini",
      contextWindow: 1000000,
      maxOutputTokens: 8192,
      capabilities: ["chat", "vision", "function-calling", "streaming", "long-context"],
      strengths: ["vision", "long-context", "extraction"],
      costPer1kInput: 0.0001,
      costPer1kOutput: 0.0004,
    },
    {
      id: "gemini-2.0-pro",
      name: "Gemini 2.0 Pro",
      provider: "gemini",
      contextWindow: 1000000,
      maxOutputTokens: 8192,
      capabilities: ["chat", "vision", "function-calling", "streaming", "long-context"],
      strengths: ["reasoning", "vision", "long-context"],
      costPer1kInput: 0.00125,
      costPer1kOutput: 0.005,
    },
  ];

  // Gemini exposes an OpenAI-compatible endpoint.
  protected endpoint = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
  protected apiKeyEnv = "GEMINI_API_KEY";
  protected authHeader(apiKey: string): Record<string, string> {
    return { Authorization: `Bearer ${apiKey}` };
  }
}
