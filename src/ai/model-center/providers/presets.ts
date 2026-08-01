// Provider 预设（纯数据，前端下拉与默认值来源）。
// 全部走 OpenAI Compatible API（/chat/completions），少数在 Adapter 内做协议适配。

import type { ProviderPreset, ProviderType } from "../types";

export const PROVIDER_PRESETS: Record<ProviderType, ProviderPreset> = {
  openai: {
    type: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    suggestedModels: [
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4o-mini", name: "GPT-4o mini" },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
    ],
    requiresKey: true,
    docsUrl: "https://platform.openai.com/api-keys",
    hint: "官方 OpenAI API，需科学上网或代理。",
  },
  deepseek: {
    type: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    suggestedModels: [
      { id: "deepseek-chat", name: "DeepSeek-V3" },
      { id: "deepseek-reasoner", name: "DeepSeek-R1" },
    ],
    requiresKey: true,
    docsUrl: "https://platform.deepseek.com/api_keys",
    hint: "性价比高，推理能力强，国内直连。",
  },
  qwen: {
    type: "qwen",
    label: "通义千问 Qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    suggestedModels: [
      { id: "qwen-max", name: "Qwen-Max" },
      { id: "qwen-plus", name: "Qwen-Plus" },
      { id: "qwen-turbo", name: "Qwen-Turbo" },
    ],
    requiresKey: true,
    docsUrl: "https://bailian.console.aliyun.com/",
    hint: "阿里云百炼 OpenAI 兼容模式。",
  },
  claude: {
    type: "claude",
    label: "Claude (Anthropic)",
    baseUrl: "https://api.anthropic.com/v1",
    suggestedModels: [
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
      { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
    ],
    requiresKey: true,
    docsUrl: "https://console.anthropic.com/settings/keys",
    hint: "Anthropic 官方，长上下文强。若用中转站请填其 OpenAI 兼容地址。",
  },
  gemini: {
    type: "gemini",
    label: "Gemini (Google)",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    suggestedModels: [
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
    ],
    requiresKey: true,
    docsUrl: "https://aistudio.google.com/apikey",
    hint: "Google AI Studio OpenAI 兼容端点。",
  },
  zhipu: {
    type: "zhipu",
    label: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    suggestedModels: [
      { id: "glm-4-plus", name: "GLM-4-Plus" },
      { id: "glm-4-flash", name: "GLM-4-Flash" },
    ],
    requiresKey: true,
    docsUrl: "https://bigmodel.cn/usercenter/apikeys",
    hint: "智谱 AI 开放平台，OpenAI 兼容。",
  },
  moonshot: {
    type: "moonshot",
    label: "Moonshot (Kimi)",
    baseUrl: "https://api.moonshot.cn/v1",
    suggestedModels: [
      { id: "moonshot-v1-8k", name: "Moonshot v1 8K" },
      { id: "moonshot-v1-32k", name: "Moonshot v1 32K" },
      { id: "moonshot-v1-128k", name: "Moonshot v1 128K" },
    ],
    requiresKey: true,
    docsUrl: "https://platform.moonshot.cn/console/api-keys",
    hint: "月之暗面 Kimi，长文本擅长。",
  },
  ollama: {
    type: "ollama",
    label: "Ollama（本地）",
    baseUrl: "http://localhost:11434/v1",
    suggestedModels: [
      { id: "llama3.1", name: "Llama 3.1" },
      { id: "qwen2.5", name: "Qwen 2.5" },
      { id: "deepseek-r1", name: "DeepSeek-R1（本地）" },
    ],
    requiresKey: false,
    docsUrl: "https://ollama.com/",
    hint: "本地私有部署，数据不出本机，无需 API Key。",
  },
  custom: {
    type: "custom",
    label: "自定义（OpenAI 兼容）",
    baseUrl: "",
    suggestedModels: [],
    requiresKey: true,
    hint: "任意 OpenAI Compatible API：填写 Base URL、Model ID 与 Key。",
  },
};

export function getPreset(type: ProviderType): ProviderPreset {
  return PROVIDER_PRESETS[type] ?? PROVIDER_PRESETS.custom;
}

export const ALL_PRESETS: ProviderPreset[] = Object.values(PROVIDER_PRESETS);
