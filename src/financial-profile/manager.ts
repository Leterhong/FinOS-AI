import "server-only";

import fs from "node:fs";
import path from "node:path";
import { type FinancialProfile, normalizeProfile } from "@/data/types";
import type {
  UserProfileRecord,
  OnboardingInput,
  UserSummary,
} from "./types";
import { buildProfileFromOnboarding } from "./default";
import { encryptToFileString, parseSecureFileString } from "@/security";

const DATA_DIR = path.join(process.cwd(), ".data", "profiles");

/** 安全化 userId，防止路径穿越。 */
function sanitize(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "default-user";
}

/**
 * 用户财富画像管理器（Phase 3.5）。
 *  - 按 userId 持久化到 .data/profiles/{userId}.json，每个用户独立文件，互不混用；
 *  - 进程内不缓存完整集合，按需读写，保证多用户隔离与一致性；
 *  - 所有 IO 容错，持久化失败不影响当次会话。
 */
class ProfileManager {
  private ensureDir() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch {
      /* 忽略目录创建失败 */
    }
  }

  private fileOf(userId: string): string {
    return path.join(DATA_DIR, `${sanitize(userId)}.json`);
  }

  private read(userId: string): UserProfileRecord | null {
    try {
      const fp = this.fileOf(userId);
      if (!fs.existsSync(fp)) return null;
      const raw = fs.readFileSync(fp, "utf-8");
      // Financial Twin 6.x：加密信封优先，兼容历史明文 JSON（读到即透明迁移）
      const parsed = parseSecureFileString<UserProfileRecord>(raw);
      if (!parsed) return null;
      const rec = parsed.value;
      if (rec && rec.userId && rec.profile) {
        // Phase 6.2 修复：旧 schema 画像缺字段会导致前端读取 undefined 报错，
        // 统一在此用 EMPTY_PROFILE 默认值补全（含嵌套 goal / modifiers 深合并）。
        rec.profile = normalizeProfile(rec.profile);
        if (parsed.migrated) this.write(rec);
        return rec;
      }
    } catch {
      /* 损坏文件：视为不存在 */
    }
    return null;
  }

  private write(rec: UserProfileRecord): void {
    try {
      this.ensureDir();
      // 敏感财务数据 AES-256-GCM 加密落盘（src/security）
      fs.writeFileSync(this.fileOf(rec.userId), encryptToFileString(rec), "utf-8");
    } catch {
      /* 持久化失败不影响本次会话 */
    }
  }

  /** 通过 Onboarding 创建真实用户画像。 */
  createProfile(input: OnboardingInput): UserProfileRecord {
    const userId =
      sanitize(input.userId ?? "") !== "default-user" && input.userId?.trim()
        ? sanitize(input.userId)
        : `user-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
    const profile: FinancialProfile = buildProfileFromOnboarding(input);
    const rec: UserProfileRecord = {
      userId,
      profile,
      isOnboarded: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.write(rec);
    return rec;
  }

  getProfile(userId: string): UserProfileRecord | null {
    return this.read(sanitize(userId));
  }

  /**
   * 确保用户画像存在：无画像时（如首次通过文档 / 导入建立数据）创建一份默认画像，
   * 使 Financial Twin 能从真实数据驱动重算，而非早退返回 null。
   * 对已有画像的用户无副作用（直接返回现有记录）。
   */
  ensureProfile(userId: string): UserProfileRecord {
    const existing = this.read(sanitize(userId));
    if (existing) return existing;
    const profile = normalizeProfile({ name: "我的财富分身" });
    const rec: UserProfileRecord = {
      userId: sanitize(userId),
      profile,
      isOnboarded: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.write(rec);
    return rec;
  }

  /** 删除用户财富画像（数据管理「清除财富数据」）。物理删除文件，不可恢复。 */
  deleteProfile(userId: string): boolean {
    try {
      const fp = this.fileOf(sanitize(userId));
      if (!fs.existsSync(fp)) return false;
      fs.unlinkSync(fp);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 直接写入已构建好的 FinancialProfile（Phase 5.8 财富初始化复用）。
   * 用于从 WealthProfile 映射后落盘，标记 isOnboarded=true。
   */
  saveProfile(userId: string, profile: FinancialProfile): UserProfileRecord {
    const sid = sanitize(userId);
    const existing = this.read(sid);
    const rec: UserProfileRecord = {
      userId: sid,
      profile,
      isOnboarded: true,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };
    this.write(rec);
    return rec;
  }

  /** 部分更新用户画像（用于用户编辑 / 事件回写）。 */
  updateProfile(
    userId: string,
    updates: Partial<FinancialProfile>
  ): UserProfileRecord | null {
    const rec = this.read(sanitize(userId));
    if (!rec) return null;
    rec.profile = { ...rec.profile, ...updates };
    rec.updatedAt = Date.now();
    this.write(rec);
    return rec;
  }

  /** 列出所有用户摘要（用于用户切换 / 调试）。 */
  listProfiles(): UserSummary[] {
    try {
      this.ensureDir();
      if (!fs.existsSync(DATA_DIR)) return [];
      return fs
        .readdirSync(DATA_DIR)
        .filter((f) => f.endsWith(".json"))
        .map((f) => {
          const rec = this.read(f.replace(/\.json$/, ""));
          if (!rec) return null;
          return {
            userId: rec.userId,
            name: rec.profile.name,
            age: rec.profile.age,
            isOnboarded: rec.isOnboarded,
            updatedAt: rec.updatedAt,
          } as UserSummary;
        })
        .filter((x): x is UserSummary => x !== null)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      return [];
    }
  }
}

export const profileManager = new ProfileManager();
