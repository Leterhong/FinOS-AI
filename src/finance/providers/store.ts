import "server-only";

/**
 * 金融数据源配置存储（Phase 6.9 需求三，仿 modelConfigStore）。
 * 用户隔离：每用户独立加密文件 .data/finance-sources/{userId}.json.enc。
 * API Key 以 AES-256-GCM 加密保存，绝不明文落盘；对外统一掩码视图。
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { encryptJson, decryptJson } from "../../financial-data/storage/crypto";
import {
  encryptApiKey,
  decryptApiKey,
  maskApiKey,
} from "../../ai/model-center/encryption";
import type { EncryptedBlob } from "../../financial-data/types";
import type { EncryptedApiKey } from "../../ai/model-center/types";
import type {
  FinanceProviderKind,
  FinanceSourceInput,
  FinanceSourceStatus,
  PublicFinanceSource,
} from "../types";
import { getFinancePreset } from "./presets";

const DATA_DIR = path.join(process.cwd(), ".data", "finance-sources");

/** 内部完整配置（含加密 Key，仅服务端使用） */
export interface FinanceSourceConfig {
  id: string;
  userId: string;
  kind: FinanceProviderKind;
  name: string;
  baseUrl?: string;
  encryptedApiKey?: EncryptedApiKey;
  status: FinanceSourceStatus;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  lastTestedAt?: string;
  lastLatencyMs?: number;
  lastError?: string;
}

interface StoreFile {
  userId: string;
  sources: FinanceSourceConfig[];
  updatedAt: string;
}

function sanitize(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 120) || "anon";
}

class FinanceSourceStore {
  private cache = new Map<string, FinanceSourceConfig[]>();

  private filePath(userId: string): string {
    return path.join(DATA_DIR, `${sanitize(userId)}.json.enc`);
  }

  private async load(userId: string): Promise<FinanceSourceConfig[]> {
    if (this.cache.has(userId)) return this.cache.get(userId)!;
    try {
      const raw = await fs.readFile(this.filePath(userId), "utf8");
      const blob = JSON.parse(raw) as EncryptedBlob;
      const file = decryptJson<StoreFile>(blob);
      const sources = file.userId === userId ? file.sources ?? [] : [];
      this.cache.set(userId, sources);
      return sources;
    } catch {
      this.cache.set(userId, []);
      return [];
    }
  }

  private async persist(userId: string, sources: FinanceSourceConfig[]) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const file: StoreFile = {
      userId,
      sources,
      updatedAt: new Date().toISOString(),
    };
    await fs.writeFile(this.filePath(userId), JSON.stringify(encryptJson(file)), "utf8");
    this.cache.set(userId, sources);
  }

  private toPublic(c: FinanceSourceConfig): PublicFinanceSource {
    let mask = "—";
    try {
      mask = c.encryptedApiKey ? maskApiKey(decryptApiKey(c.encryptedApiKey)) : "—";
    } catch {
      mask = "****";
    }
    return {
      id: c.id,
      userId: c.userId,
      kind: c.kind,
      name: c.name,
      baseUrl: c.baseUrl,
      keyMask: mask,
      status: c.status,
      isDefault: c.isDefault,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      lastTestedAt: c.lastTestedAt,
      lastLatencyMs: c.lastLatencyMs,
      lastError: c.lastError,
    };
  }

  async list(userId: string): Promise<PublicFinanceSource[]> {
    return (await this.load(userId)).map((c) => this.toPublic(c));
  }

  /** 服务端内部：全部原始配置（含加密 Key） */
  async listRaw(userId: string): Promise<FinanceSourceConfig[]> {
    return this.load(userId);
  }

  async getRaw(userId: string, id: string): Promise<FinanceSourceConfig | null> {
    return (await this.load(userId)).find((c) => c.id === id) ?? null;
  }

  /** 明文 Key（仅服务端内存短暂使用） */
  decryptKey(config: FinanceSourceConfig): string {
    if (!config.encryptedApiKey) return "";
    try {
      return decryptApiKey(config.encryptedApiKey);
    } catch {
      return "";
    }
  }

  async add(userId: string, input: FinanceSourceInput): Promise<PublicFinanceSource> {
    const sources = await this.load(userId);
    const preset = getFinancePreset(input.kind);
    const now = new Date().toISOString();
    const config: FinanceSourceConfig = {
      id: randomUUID(),
      userId,
      kind: input.kind,
      name: input.name?.trim() || preset.label,
      baseUrl: (input.baseUrl?.trim() || preset.defaultBaseUrl || "").replace(/\/+$/, "") || undefined,
      encryptedApiKey: input.apiKey ? encryptApiKey(input.apiKey.trim()) : undefined,
      status: "untested",
      isDefault: sources.length === 0,
      createdAt: now,
      updatedAt: now,
    };
    sources.push(config);
    await this.persist(userId, sources);
    return this.toPublic(config);
  }

  async update(
    userId: string,
    id: string,
    input: Partial<FinanceSourceInput>,
  ): Promise<PublicFinanceSource | null> {
    const sources = await this.load(userId);
    const c = sources.find((x) => x.id === id);
    if (!c) return null;
    if (input.kind) c.kind = input.kind;
    if (input.name !== undefined) c.name = input.name.trim() || c.name;
    if (input.baseUrl !== undefined) {
      c.baseUrl = input.baseUrl.trim().replace(/\/+$/, "") || c.baseUrl;
    }
    // apiKey 留空表示不修改；提供则重新加密
    if (input.apiKey) c.encryptedApiKey = encryptApiKey(input.apiKey.trim());
    c.status = "untested";
    c.updatedAt = new Date().toISOString();
    await this.persist(userId, sources);
    return this.toPublic(c);
  }

  async remove(userId: string, id: string): Promise<{ removed: boolean; newDefaultId?: string }> {
    const sources = await this.load(userId);
    const idx = sources.findIndex((c) => c.id === id);
    if (idx === -1) return { removed: false };
    const wasDefault = sources[idx].isDefault;
    sources.splice(idx, 1);
    let newDefaultId: string | undefined;
    if (wasDefault && sources.length > 0) {
      sources[0].isDefault = true;
      newDefaultId = sources[0].id;
    }
    await this.persist(userId, sources);
    return { removed: true, newDefaultId };
  }

  async setDefault(userId: string, id: string): Promise<PublicFinanceSource | null> {
    const sources = await this.load(userId);
    const target = sources.find((c) => c.id === id);
    if (!target) return null;
    for (const c of sources) c.isDefault = c.id === id;
    target.updatedAt = new Date().toISOString();
    await this.persist(userId, sources);
    return this.toPublic(target);
  }

  async recordTest(
    userId: string,
    id: string,
    patch: { status: FinanceSourceStatus; latencyMs?: number; error?: string },
  ): Promise<void> {
    const sources = await this.load(userId);
    const c = sources.find((x) => x.id === id);
    if (!c) return;
    c.status = patch.status;
    c.lastTestedAt = new Date().toISOString();
    c.lastLatencyMs = patch.latencyMs;
    c.lastError = patch.error;
    c.updatedAt = c.lastTestedAt;
    await this.persist(userId, sources);
  }

  async clear(userId: string): Promise<void> {
    await this.persist(userId, []);
  }
}

export const financeSourceStore = new FinanceSourceStore();
