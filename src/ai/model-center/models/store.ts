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
import { assertSafeBaseUrl } from "../providers/base-url-guard";
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

/** 密文存在但无法解密（FINOS_DATA_KEY 变更/丢失等）——绝不能当作空库覆盖写回。 */
export class ModelStoreDecryptError extends Error {}

function sanitize(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 120) || "anon";
}

/** 采样参数服务端兜底校验：前端传什么都不得破坏后续上游请求。 */
function coerceTemperature(value: unknown): number | undefined {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 2 ? n : undefined;
}

function coerceMaxTokens(value: unknown): number | undefined {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n > 0 && n <= 1_000_000 ? n : undefined;
}

/** 单价校验：非负有限数，上限 100000 美元/百万 Token，防误填。 */
function coercePrice(value: unknown): number | undefined {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100_000 ? n : undefined;
}

/** 字符串兜底：非字符串输入一律返回空串，避免对对象/数字调用 .trim() 抛错。 */
function safeTrim(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

class ModelConfigStore {
  private cache = new Map<string, AIProviderConfig[]>();

  /** 每个 userId 的读-改-写串行化队列，避免并发写入相互覆盖。 */
  private locks = new Map<string, Promise<unknown>>();

  private withLock<T>(userId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(userId) ?? Promise.resolve();
    const run = previous.then(operation, operation);
    this.locks.set(userId, run.then(() => undefined, () => undefined));
    return run;
  }

  private filePath(userId: string): string {
    return path.join(DATA_DIR, `${sanitize(userId)}.json.enc`);
  }

  private async ensureDir() {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }

  private async load(userId: string): Promise<AIProviderConfig[]> {
    if (this.cache.has(userId)) return this.cache.get(userId)!;
    let raw: string;
    try {
      raw = await fs.readFile(this.filePath(userId), "utf8");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code === "ENOENT") {
        // 全新工作区：没有密文文件是正常状态。缓存与返回值必须是同一实例，
        // 否则并发首个写入会各自持有独立空数组、末次覆盖前次。
        const empty: AIProviderConfig[] = [];
        this.cache.set(userId, empty);
        return empty;
      }
      throw error;
    }
    let file: StoreFile;
    try {
      const blob = JSON.parse(raw) as EncryptedBlob;
      file = decryptJson<StoreFile>(blob);
    } catch (error) {
      // 解密失败（密钥不匹配/文件损坏）：向上抛出并拒绝一切写操作，
      // 否则下一次 persist() 会用空列表覆盖密文，用户 API Key 静默清零。
      throw new ModelStoreDecryptError(
        "模型配置解密失败：请确认 FINOS_DATA_KEY 与加密该数据时一致",
        { cause: error }
      );
    }
    // 用户隔离强校验：文件内 userId 必须匹配。
    const configs = file.userId === userId ? file.configs ?? [] : [];
    this.cache.set(userId, configs);
    return configs;
  }

  private async persist(userId: string, configs: AIProviderConfig[]) {
    await this.ensureDir();
    const file: StoreFile = {
      userId,
      configs,
      updatedAt: new Date().toISOString(),
    };
    const blob = encryptJson(file);
    const target = this.filePath(userId);
    // 原子写：先写临时文件再 rename，进程崩溃/磁盘满不会留下半截密文。
    const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(blob), "utf8");
    await fs.rename(tmp, target);
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
      inputPricePerMillion: c.inputPricePerMillion,
      outputPricePerMillion: c.outputPricePerMillion,
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

  add(userId: string, input: ProviderConfigInput): Promise<PublicProviderConfig> {
    return this.withLock(userId, () => this._add(userId, input));
  }

  update(userId: string, id: string, input: Partial<ProviderConfigInput>): Promise<PublicProviderConfig | null> {
    return this.withLock(userId, () => this._update(userId, id, input));
  }

  remove(userId: string, id: string): Promise<{ removed: boolean; newDefaultId?: string }> {
    return this.withLock(userId, () => this._remove(userId, id));
  }

  /** 清除某工作区的内存缓存（账户删除后调用，避免残留数据被继续读取）。 */
  forget(userId: string): void {
    this.cache.delete(userId);
  }

  setDefault(userId: string, id: string): Promise<PublicProviderConfig | null> {
    return this.withLock(userId, () => this._setDefault(userId, id));
  }

  recordTest(userId: string, id: string, patch: { status: AIProviderConfig["status"]; latencyMs?: number; error?: string }): Promise<void> {
    return this.withLock(userId, () => this._recordTest(userId, id, patch));
  }

  clear(userId: string): Promise<void> {
    return this.withLock(userId, () => this._clear(userId));
  }

  private async _add(userId: string, input: ProviderConfigInput): Promise<PublicProviderConfig> {
    const configs = await this.load(userId);
    const preset = getPreset(input.providerName);
    const now = new Date().toISOString();
    const baseUrl = (safeTrim(input.baseUrl) || preset.baseUrl).replace(/\/+$/, "");
    // 出站边界：落库前校验 Base URL（拒绝云元数据/链路本地，生产默认禁内网）。
    await assertSafeBaseUrl(baseUrl);
    const config: AIProviderConfig = {
      id: randomUUID(),
      userId,
      providerName: input.providerName,
      providerType: input.providerName,
      displayName: safeTrim(input.displayName) || preset.label,
      modelName: safeTrim(input.modelName) || input.modelId,
      modelId: input.modelId.trim(),
      baseUrl,
      encryptedApiKey: typeof input.apiKey === "string" && input.apiKey.trim() ? encryptApiKey(input.apiKey.trim()) : undefined,
      temperature: coerceTemperature(input.temperature),
      maxTokens: coerceMaxTokens(input.maxTokens),
      inputPricePerMillion: coercePrice(input.inputPricePerMillion),
      outputPricePerMillion: coercePrice(input.outputPricePerMillion),
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

  private async _update(
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
    if (input.displayName !== undefined) c.displayName = safeTrim(input.displayName) || c.displayName;
    if (input.modelName !== undefined) c.modelName = safeTrim(input.modelName) || c.modelName;
    if (input.modelId !== undefined) c.modelId = safeTrim(input.modelId) || c.modelId;
    if (input.baseUrl !== undefined) {
      const nextBaseUrl = safeTrim(input.baseUrl).replace(/\/+$/, "") || c.baseUrl;
      await assertSafeBaseUrl(nextBaseUrl);
      c.baseUrl = nextBaseUrl;
    }
    if (input.roles !== undefined) c.roles = input.roles;
    // 采样参数服务端兜底校验（不信任上游 UI）。
    const temperature = coerceTemperature(input.temperature);
    if (temperature !== undefined) c.temperature = temperature;
    const maxTokens = coerceMaxTokens(input.maxTokens);
    if (maxTokens !== undefined) c.maxTokens = maxTokens;
    if (input.inputPricePerMillion !== undefined) c.inputPricePerMillion = coercePrice(input.inputPricePerMillion);
    if (input.outputPricePerMillion !== undefined) c.outputPricePerMillion = coercePrice(input.outputPricePerMillion);
    // apiKey 留空表示不修改；提供则重新加密。
    if (typeof input.apiKey === "string" && input.apiKey.trim()) c.encryptedApiKey = encryptApiKey(input.apiKey.trim());
    c.status = "untested"; // 配置变更后需重新测试
    c.updatedAt = new Date().toISOString();
    await this.persist(userId, configs);
    return this.toPublic(c);
  }

  private async _remove(userId: string, id: string): Promise<{ removed: boolean; newDefaultId?: string }> {
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

  private async _setDefault(userId: string, id: string): Promise<PublicProviderConfig | null> {
    const configs = await this.load(userId);
    const target = configs.find((c) => c.id === id);
    if (!target) return null;
    for (const c of configs) c.isDefault = c.id === id;
    target.updatedAt = new Date().toISOString();
    await this.persist(userId, configs);
    return this.toPublic(target);
  }

  /** 测试后回写状态/延迟。 */
  private async _recordTest(
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

  private async _clear(userId: string): Promise<void> {
    await this.persist(userId, []);
  }

  /** 账号绑定时把访客工作区的模型配置迁移到账号工作区（目标已存在则不覆盖）。 */
  async migrateWorkspace(fromUserId: string, toUserId: string): Promise<boolean> {
    if (!fromUserId || !toUserId || fromUserId === toUserId) return false;
    const target = this.filePath(toUserId);
    try {
      await fs.access(target);
      return false; // 账号已有模型配置，保留账号现有数据
    } catch {
      // 目标不存在，继续复制。
    }
    try {
      const raw = await fs.readFile(this.filePath(fromUserId), "utf8");
      const blob = JSON.parse(raw) as EncryptedBlob;
      const file = decryptJson<StoreFile>(blob);
      // 文件内 userId 必须改写为目标身份，否则 load() 的用户隔离校验会返回空数据。
      const migrated: StoreFile = { ...file, userId: toUserId, updatedAt: new Date().toISOString() };
      await this.ensureDir();
      const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(encryptJson(migrated)), "utf8");
      await fs.rename(tmp, target);
      this.cache.delete(toUserId);
      return true;
    } catch {
      return false;
    }
  }
}

export const modelConfigStore = new ModelConfigStore();
