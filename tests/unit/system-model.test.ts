import assert from "node:assert/strict";
import test from "node:test";

import { getSystemModel, getSystemModelSummary, readSystemModelConfig } from "../../src/ai/model-center/models/system-model";

test("未配置必填项时返回 null", () => {
  assert.equal(readSystemModelConfig({}), null);
  assert.equal(readSystemModelConfig({ AI_BASE_URL: "https://api.deepseek.com/v1" }), null);
  assert.equal(readSystemModelConfig({ AI_BASE_URL: "https://x/v1", AI_MODEL: "m" }), null);
});

test("配置完整时解析出共享模型，并带默认值与 Token 上限", () => {
  const config = readSystemModelConfig({
    AI_BASE_URL: "https://api.deepseek.com/v1/",
    AI_MODEL: "deepseek-chat",
    AI_API_KEY: "sk-test",
  });
  assert.ok(config);
  assert.equal(config!.baseUrl, "https://api.deepseek.com/v1");
  assert.equal(config!.modelId, "deepseek-chat");
  assert.equal(config!.providerType, "custom");
  assert.equal(config!.displayName, "deepseek-chat（全站默认）");
  assert.equal(config!.maxTokens, 2048);
});

test("显式关闭或非法 provider 的处理", () => {
  const base = { AI_BASE_URL: "https://x/v1", AI_MODEL: "m", AI_API_KEY: "sk" };
  assert.equal(readSystemModelConfig({ ...base, AI_SHARED_MODEL: "0" }), null);
  const config = readSystemModelConfig({ ...base, AI_PROVIDER: "not-a-provider" });
  assert.equal(config?.providerType, "custom");
});

test("getSystemModel 标记 shared，且返回前端的摘要不含密钥", () => {
  const saved = { ...process.env };
  process.env.AI_BASE_URL = "https://api.example.com/v1";
  process.env.AI_MODEL = "demo-model";
  process.env.AI_API_KEY = "sk-super-secret-value";
  try {
    const model = getSystemModel();
    assert.ok(model);
    assert.equal(model!.shared, true);
    assert.equal(model!.apiKey, "sk-super-secret-value");
    const summary = getSystemModelSummary();
    assert.equal(summary?.configured, true);
    assert.equal(JSON.stringify(summary).includes("sk-super-secret-value"), false, "前端摘要不得包含密钥");
  } finally {
    process.env = saved;
  }
});
