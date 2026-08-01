import "server-only";

/**
 * 用户账户存储（Phase 5.6）—— 仅服务端。
 *  - 每账户独立文件 .data/users/{id}.json，与业务数据同构，按 userId 物理隔离；
 *  - 维护 email → id 索引文件 .data/users/_emails.json，保证邮箱唯一；
 *  - 所有 IO 容错，失败不抛出致命异常（除非唯一性约束冲突需要显式反馈）。
 */

import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { UserAccount, PublicUser } from "./types";
import { hashPassword } from "./crypto";

const DATA_DIR = path.join(process.cwd(), ".data", "users");
const EMAIL_INDEX = path.join(DATA_DIR, "_emails.json");

/** 安全化 ID，防止路径穿越；保留 _emails 之外的合法字符。 */
function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** 生成对外用户 ID。 */
function genUserId(): string {
  return `user-${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
}

/** 剥离敏感字段。 */
export function toPublicUser(acc: UserAccount): PublicUser {
  return {
    id: acc.id,
    email: acc.email,
    name: acc.name,
    avatarUrl: acc.avatarUrl,
    profileCompleted: acc.profileCompleted,
    createdAt: acc.createdAt,
  };
}

class UserAccountStore {
  private ensureDir() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    } catch {
      /* 忽略目录创建失败 */
    }
  }

  private fileOf(id: string): string {
    return path.join(DATA_DIR, `${sanitize(id)}.json`);
  }

  private readEmailIndex(): Record<string, string> {
    try {
      if (!fs.existsSync(EMAIL_INDEX)) return {};
      return JSON.parse(fs.readFileSync(EMAIL_INDEX, "utf-8")) as Record<
        string,
        string
      >;
    } catch {
      return {};
    }
  }

  private writeEmailIndex(idx: Record<string, string>): void {
    try {
      this.ensureDir();
      fs.writeFileSync(EMAIL_INDEX, JSON.stringify(idx, null, 2), "utf-8");
    } catch {
      /* 忽略索引写入失败 */
    }
  }

  private readAccount(id: string): UserAccount | null {
    try {
      const fp = this.fileOf(id);
      if (!fs.existsSync(fp)) return null;
      const parsed = JSON.parse(fs.readFileSync(fp, "utf-8")) as UserAccount;
      if (parsed && parsed.id && parsed.email && parsed.passwordHash) {
        return parsed;
      }
    } catch {
      /* 损坏文件视为不存在 */
    }
    return null;
  }

  private writeAccount(acc: UserAccount): void {
    this.ensureDir();
    fs.writeFileSync(this.fileOf(acc.id), JSON.stringify(acc, null, 2), "utf-8");
  }

  /** 按 ID 获取账户（含敏感字段，仅内部使用）。 */
  getById(id: string): UserAccount | null {
    return this.readAccount(sanitize(id));
  }

  /** 按邮箱获取账户（含敏感字段，仅内部使用）。 */
  findByEmail(email: string): UserAccount | null {
    const idx = this.readEmailIndex();
    const id = idx[normalizeEmail(email)];
    if (!id) return null;
    return this.readAccount(id);
  }

  /** 邮箱是否已注册。 */
  emailExists(email: string): boolean {
    const idx = this.readEmailIndex();
    return Boolean(idx[normalizeEmail(email)]);
  }

  /**
   * 创建账户。emailExists 冲突时抛出 EMAIL_TAKEN。
   * @param opts.id 指定 ID；缺省自动生成。
   */
  create(opts: {
    email: string;
    password: string;
    name?: string;
    id?: string;
    avatarUrl?: string;
  }): UserAccount {
    const email = normalizeEmail(opts.email);
    if (this.emailExists(email)) {
      throw new Error("EMAIL_TAKEN");
    }
    const id = opts.id ? sanitize(opts.id) : genUserId();
    const { passwordHash, passwordSalt } = hashPassword(opts.password);
    const now = Date.now();
    const acc: UserAccount = {
      id,
      email,
      name: opts.name?.trim() || email.split("@")[0] || "用户",
      passwordHash,
      passwordSalt,
      avatarUrl: opts.avatarUrl,
      profileCompleted: false,
      createdAt: now,
      updatedAt: now,
    };
    this.writeAccount(acc);
    const idx = this.readEmailIndex();
    idx[email] = id;
    this.writeEmailIndex(idx);
    return acc;
  }

  /** 更新头像 URL；返回更新后的账户或 null。 */
  updateAvatar(id: string, avatarUrl: string | undefined): UserAccount | null {
    const acc = this.readAccount(sanitize(id));
    if (!acc) return null;
    acc.avatarUrl = avatarUrl;
    acc.updatedAt = Date.now();
    this.writeAccount(acc);
    return acc;
  }

  /** 更新显示名称。 */
  updateName(id: string, name: string): UserAccount | null {
    const acc = this.readAccount(sanitize(id));
    if (!acc) return null;
    acc.name = name.trim() || acc.name;
    acc.updatedAt = Date.now();
    this.writeAccount(acc);
    return acc;
  }

  /** 更新财富初始化完成标志（Phase 5.8）。 */
  updateProfileCompleted(id: string, completed: boolean): UserAccount | null {
    const acc = this.readAccount(sanitize(id));
    if (!acc) return null;
    acc.profileCompleted = completed;
    acc.updatedAt = Date.now();
    this.writeAccount(acc);
    return acc;
  }

  /** 删除账户（数据管理「删除账户」）。同时清理邮箱索引；不影响其业务数据文件独立性。 */
  delete(id: string): boolean {
    const sid = sanitize(id);
    try {
      const fp = this.fileOf(sid);
      if (!fs.existsSync(fp)) return false;
      const acc = this.readAccount(sid);
      if (acc) {
        const idx = this.readEmailIndex();
        delete idx[normalizeEmail(acc.email)];
        this.writeEmailIndex(idx);
      }
      fs.unlinkSync(fp);
      return true;
    } catch {
      return false;
    }
  }
}

export const userAccountStore = new UserAccountStore();
