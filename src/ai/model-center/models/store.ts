import "server-only";

/**
 * 模型配置存储（Phase 5.5 三/四）。
 * 用户隔离：每用户独立加密文件 .data/models/{userId}.json.enc。
 * API Key 以 AES-256-GCM 加密后保存（encryptedApiKey），绝不明文落盘。
 * 对外输出统一走 toPublic() 掩码，明文 Key 只在服务端解析时短暂存在于内存。
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { encryptJson, decryptJson } from "../../../financial-data/storage/crypto";
import { encryptApiKey, decryptApiKey, maskApiKey } from "../encryption";
import { getPreset } from "../providers/presets";
import type { EncryptedBlob } from "../../../financial-data/types";
import type {
  AIProviderConfig,
  ProviderConfigInput,
  PublicProviderConfig,
} from "../types";

const DATA_DIR = path.join(process.cwd(), ".data", "models");

interface StoreFile {
  userId: string;
  configs: AIProviderConfig[];
  updatedAt: string;
}

function sanitize(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 120) || "anon";
}

class ModelConfigStore {
  private cache = new Map<string, AIProviderConfig[]>();

  private filePath(userId: string): string {
    return path.join(DATA_DIR, `${sanitize(userId)}.json.enc`);
  }

  private async ensureDir() {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }

  private async load(userId: string): Promise<AIProviderConfig[]> {
    if (this.cache.has(userId)) return this.cache.get(userId)!;
    try {
      const raw = await fs.readFile(this.filePath(userId), "utf8");
      const blob = JSON.parse(raw) as EncryptedBlob;
      const file = decryptJson<StoreFile>(blob);
      // 用户隔离强校验：文件内 userId 必须匹配。
      const configs = file.userId === userId ? file.configs ?? [] : [];
      this.cache.set(userId, configs);
      return configs;
    } catch {
      this.cache.set(userId, []);
      return [];
    }
  }

  private async persist(userId: string, configs: AIProviderConfig[]) {
    await this.ensureDir();
    const file: StoreFile = {
      userId,
      configs,
      updatedAt: new Date().toISOString(),
    };
    const blob = encryptJson(file);
    await fs.writeFile(this.filePath(userId), JSON.stringify(blob), "utf8");
    this.cache.set(userId, configs);
  }

  /** 掩码后的安全视图（前端专用）。 */
  private toPublic(c: AIProviderConfig): PublicProviderConfig {
    let mask = "—";
    try {
      mask = c.encryptedApiKey ? maskApiKey(decryptApiKey(c.encryptedApiKey)) : "—";
    } catch {
      mask = "****";
    }
    return {
      id: c.id,
      userId: c.userId,
      providerName: c.providerName,
      displayName: c.displayName,
      modelName: c.modelName,
      modelId: c.modelId,
      baseUrl: c.baseUrl,
      providerType: c.providerType,
      status: c.status,
      isDefault: c.isDefault,
      roles: c.roles,
      temperature: c.temperature,
      maxTokens: c.maxTokens,
      keyMask: mask,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      lastTestedAt: c.lastTestedAt,
      lastLatencyMs: c.lastLatencyMs,
      lastError: c.lastError,
    };
  }

  // ── 查询 ────────────────────────────────────────────────────────────────

  async list(userId: string): Promise<PublicProviderConfig[]> {
    const configs = await this.load(userId);
    return configs.map((c) => this.toPublic(c));
  }

  async count(userId: string): Promise<number> {
    return (await this.load(userId)).length;
  }

  /** 内部使用：取含加密 Key 的原始配置。 */
  async getRaw(userId: string, id: string): Promise<AIProviderConfig | null> {
    const configs = await this.load(userId);
    return configs.find((c) => c.id === id) ?? null;
  }

  /** 取默认模型的原始配置（无默认则取第一个 online，再退第一个）。 */
  async getDefaultRaw(userId: string): Promise<AIProviderConfig | null> {
    const configs = await this.load(userId);
    if (configs.length === 0) return null;
    return (
      configs.find((c) => c.isDefault) ??
      configs.find((c) => c.status === "online") ??
      configs[0]
    );
  }

  /** 取解密后的明文 Key（服务端内存使用）。 */
  decryptKey(config: AIProviderConfig): string {
    if (!config.encryptedApiKey) return "";
    try {
      return decryptApiKey(config.encryptedApiKey);
    } catch {
      return "";
    }
  }

  // ── 变更 ────────────────────────────────────────────────────────────────

  async add(userId: string, input: ProviderConfigInput): Promise<PublicProviderConfig> {
    const configs = await this.load(userId);
    const preset = getPreset(input.providerName);
    const now = new Date().toISOString();
    const config: AIProviderConfig = {
      id: randomUUID(),
      userId,
      providerName: input.providerName,
      providerType: input.providerName,
      displayName: input.displayName?.trim() || preset.label,
      modelName: input.modelName?.trim() || input.modelId,
      modelId: input.modelId.trim(),
      baseUrl: (input.baseUrl?.trim() || preset.baseUrl).replace(/\/+$/, ""),
      encryptedApiKey: input.apiKey ? encryptApiKey(input.apiKey.trim()) : undefined,
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      status: "untested",
      isDefault: configs.length === 0, // 首个模型自动设为默认
      roles: input.roles ?? ["default"],
      createdAt: now,
      updatedAt: now,
    };
    configs.push(config);
    await this.persist(userId, configs);
    return this.toPublic(config);
  }

  async update(
    userId: string,
    id: string,
    input: Partial<ProviderConfigInput>
  ): Promise<PublicProviderConfig | null> {
    const configs = await this.load(userId);
    const c = configs.find((x) => x.id === id);
    if (!c) return null;
    if (input.providerName) {
      c.providerName = input.providerName;
      c.providerType = input.providerName;
    }
    if (input.displayName !== undefined) c.displayName = input.displayName.trim() || c.displayName;
    if (input.modelName !== undefined) c.modelName = input.modelName.trim() || c.modelName;
    if (input.modelId !== undefined) c.modelId = input.modelId.trim() || c.modelId;
    if (input.baseUrl !== undefined) c.baseUrl = input.baseUrl.trim().replace(/\/+$/, "") || c.baseUrl;
    if (input.roles !== undefined) c.roles = input.roles;
    // 采样参数（数字或 undefined）；NaN/负数防御由上游 UI 保证。
    if (input.temperature !== undefined) c.temperature = input.temperature;
    if (input.maxTokens !== undefined) c.maxTokens = input.maxTokens;
    // apiKey 留空表示不修改；提供则重新加密。
    if (input.apiKey) c.encryptedApiKey = encryptApiKey(input.apiKey.trim());
    c.status = "untested"; // 配置变更后需重新测试
    c.updatedAt = new Date().toISOString();
    await this.persist(userId, configs);
    return this.toPublic(c);
  }

  async remove(userId: string, id: string): Promise<{ removed: boolean; newDefaultId?: string }> {
    const configs = await this.load(userId);
    const idx = configs.findIndex((c) => c.id === id);
    if (idx === -1) return { removed: false };
    const wasDefault = configs[idx].isDefault;
    configs.splice(idx, 1);
    let newDefaultId: string | undefined;
    // 删除默认模型后自动回退：把第一个剩余模型设为默认（Phase 5.5 验收测试4）。
    if (wasDefault && configs.length > 0) {
      configs[0].isDefault = true;
      newDefaultId = configs[0].id;
    }
    await this.persist(userId, configs);
    return { removed: true, newDefaultId };
  }

  async setDefault(userId: string, id: string): Promise<PublicProviderConfig | null> {
    const configs = await this.load(userId);
    const target = configs.find((c) => c.id === id);
    if (!target) return null;
    for (const c of configs) c.isDefault = c.id === id;
    target.updatedAt = new Date().toISOString();
    await this.persist(userId, configs);
    return this.toPublic(target);
  }

  /** 测试后回写状态/延迟。 */
  async recordTest(
    userId: string,
    id: string,
    patch: { status: AIProviderConfig["status"]; latencyMs?: number; error?: string }
  ): Promise<void> {
    const configs = await this.load(userId);
    const c = configs.find((x) => x.id === id);
    if (!c) return;
    c.status = patch.status;
    c.lastTestedAt = new Date().toISOString();
    c.lastLatencyMs = patch.latencyMs;
    c.lastError = patch.error;
    c.updatedAt = c.lastTestedAt;
    await this.persist(userId, configs);
  }

  async clear(userId: string): Promise<void> {
    await this.persist(userId, []);
  }
}

export const modelConfigStore = new ModelConfigStore();
