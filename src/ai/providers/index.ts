import type { Provider, ProviderId } from "../types";
import { OpenAIProvider } from "./openai";
import { ClaudeProvider } from "./claude";
import { DeepSeekProvider } from "./deepseek";
import { GeminiProvider } from "./gemini";
import { QwenProvider } from "./qwen";
import { SeedProvider } from "./seed";

// Singleton instances, lazy-initialized on first access
let _openai: OpenAIProvider | null = null;
let _claude: ClaudeProvider | null = null;
let _deepseek: DeepSeekProvider | null = null;
let _gemini: GeminiProvider | null = null;
let _qwen: QwenProvider | null = null;
let _seed: SeedProvider | null = null;

export function getProvider(id: ProviderId): Provider {
  switch (id) {
    case "openai":
      return (_openai ??= new OpenAIProvider());
    case "claude":
      return (_claude ??= new ClaudeProvider());
    case "deepseek":
      return (_deepseek ??= new DeepSeekProvider());
    case "gemini":
      return (_gemini ??= new GeminiProvider());
    case "qwen":
      return (_qwen ??= new QwenProvider());
    case "seed":
      return (_seed ??= new SeedProvider());
    default:
      return (_seed ??= new SeedProvider());
  }
}

export function getAllProviders(): Provider[] {
  return [
    getProvider("openai"),
    getProvider("claude"),
    getProvider("deepseek"),
    getProvider("gemini"),
    getProvider("qwen"),
    getProvider("seed"),
  ];
}

export function getDefaultProvider(): Provider {
  return getProvider("seed");
}
