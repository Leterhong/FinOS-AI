import "server-only";

/**
 * 财富初始化画像存储（Phase 5.8 / Financial Twin 6.x 加密升级）。
 *  - 按 userId 持久化到 .data/financial_profiles/{userId}.json，与业务画像隔离；
 *  - 敏感财务数据（资产 / 收入 / 负债 / 目标）落盘前经 AES-256-GCM 加密（src/security）；
 *  - 读取兼容历史明文 JSON，读到即透明迁移为加密副本；
 *  - 仅服务端读写，所有 IO 容错；
 *  - 提供 WealthProfile ↔ FinancialProfile 映射，供 Twin 计算与 Dashboard 展示复用。
 */

import fs from "node:fs";
import path from "node:path";
import type { FinancialProfile } from "@/data/types";
import {
  sumAssets,
  sumLiabilities,
  type WealthProfile,
} from "./wealth-types";
import { encryptToFileString, parseSecureFileString } from "@/security";

const DATA_DIR = path.join(process.cwd(), ".data", "financial_profiles");

/** 安全化 userId，防止路径穿越。 */
function sanitize(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "default-user";
}

function genId(): string {
  return `wp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

class WealthProfileManager {
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

  /** 加密写盘（AES-256-GCM 信封）。 */
  private writeEncrypted(rec: WealthProfile): void {
    this.ensureDir();
    fs.writeFileSync(this.fileOf(rec.userId), encryptToFileString(rec), "utf-8");
  }

  /** 读取已完成的财富画像（completed=true）。未完成/不存在返回 null。 */
  get(userId: string): WealthProfile | null {
    try {
      const fp = this.fileOf(userId);
      if (!fs.existsSync(fp)) return null;
      const parsed = parseSecureFileString<WealthProfile>(
        fs.readFileSync(fp, "utf-8")
      );
      if (!parsed) return null;
      const rec = parsed.value;
      if (rec && rec.userId && rec.completed) {
        // 历史明文文件 → 读到即透明迁移为加密副本
        if (parsed.migrated) {
          try {
            this.writeEncrypted(rec);
          } catch {
            /* 迁移失败不影响本次读取 */
          }
        }
        return rec;
      }
    } catch {
      /* 损坏文件视为不存在 */
    }
    return null;
  }

  /** 创建（或覆盖）财富画像，写入 completed=true 记录（加密落盘）。 */
  create(input: WealthProfile): WealthProfile {
    const rec: WealthProfile = { ...input, id: input.id || genId(), updatedAt: Date.now() };
    this.writeEncrypted(rec);
    return rec;
  }

  /** 部分更新财富画像（加密落盘）。 */
  update(userId: string, updates: Partial<WealthProfile>): WealthProfile | null {
    const rec = this.get(userId);
    if (!rec) return null;
    const merged: WealthProfile = { ...rec, ...updates, updatedAt: Date.now() };
    this.writeEncrypted(merged);
    return merged;
  }

  /** 删除财富画像（数据管理「清除财富数据」）。 */
  delete(userId: string): boolean {
    try {
      const fp = this.fileOf(sanitize(userId));
      if (!fs.existsSync(fp)) return false;
      fs.unlinkSync(fp);
      return true;
    } catch {
      return false;
    }
  }
}

export const wealthProfileManager = new WealthProfileManager();

/**
 * 将财富初始化采集的 WealthProfile 映射为系统计算用的 FinancialProfile。
 * 资产/负债分项聚合为 totalAssets / liabilities；其余字段一一对应。
 */
export function toFinancialProfile(w: WealthProfile): FinancialProfile {
  const totalAssets = sumAssets(w.assets);
  const totalLiabilities = sumLiabilities(w.liabilities);

  return {
    name: w.name,
    age: w.age,
    occupation: w.occupation,
    monthlySalary: w.income,
    totalAssets,
    liabilities: totalLiabilities,
    monthlyExpenses: w.expense,
    monthlyInvestment: w.investment,
    // 现金类 = 流动现金 + 银行存款
    cashSavings: (w.assets.cash || 0) + (w.assets.deposits || 0),
    stockPortfolio: w.assets.stocks || 0,
    realEstate: w.assets.realEstate || 0,
    bonds: w.assets.bonds || 0,
    crypto: 0,
    funds: w.assets.funds || 0,
    // 「其他资产」无专属槽位，暂计入 insurance 槽（仅参与总资产聚合展示）
    insurance: w.assets.other || 0,
    house: 0,
    riskLevel: "moderate",
    riskExperience: "some",
    riskTolerance: "medium",
    goal: {
      retirementAge: w.goals.retirementAge || 0,
      targetAmount: w.goals.targetAmount || 0,
    },
    modifiers: { extraExpense: 0, extraIncome: 0, extraInvestment: 0, extraReturn: 0 },
    goals: w.goals.lifeGoal
      ? [
          {
            id: "goal-life",
            type: w.goals.type === "retirement" ? "retirement" : "other",
            label: w.goals.lifeGoal,
            targetAmount: w.goals.targetAmount || undefined,
            priority: "medium",
            status: "active",
          },
        ]
      : undefined,
  };
}
