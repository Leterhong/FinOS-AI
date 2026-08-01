import "server-only";

/**
 * Data Permission Layer（Phase 6.3 #220）。
 *
 * AI 分析引用用户真实金融数据前的「同意 + 作用域 + 审计」防线：
 *
 *  - DataScope：真实数据按用途拆分为 4 个作用域（现金流 / 持仓投资 / 资产总览 / 保险），
 *    用户可独立开关每个作用域是否允许 AI 读取；
 *  - 默认全部授权（opt-out 模式）：用户导入 / 手动添加数据即视为希望 AI 基于真实数据分析，
 *    但保留随时关闭任一作用域的权利；
 *  - filterRealDataByConsent：按作用域做「字段级」裁剪，未授权的字段不进入 LLM prompt；
 *  - logDataAccess：每次 AI 读取真实数据都会落审计日志（.data/consent/{userId}.json），
 *    记录时间、作用域、访问方（agent / workflow）与是否被拒绝，最多保留 200 条。
 *
 * 存储路径：.data/consent/{userId}.json（非敏感明文：仅开关 + 审计元信息，不含金融数据本体）。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { FinancialContextData } from "@/ai/types";

const DATA_DIR = join(process.cwd(), ".data", "consent");
const MAX_AUDIT_ENTRIES = 200;

/** 真实金融数据作用域。 */
export type DataScope = "cashflow" | "investments" | "assets" | "insurance" | "market";

export const DATA_SCOPES: DataScope[] = [
  "cashflow",
  "investments",
  "assets",
  "insurance",
  "market",
];

export const DATA_SCOPE_LABELS: Record<DataScope, string> = {
  cashflow: "收支流水（月度现金流、消费分类）",
  investments: "投资持仓（股票 / 基金 / 加密等持仓与收益）",
  assets: "资产总览（总投资、总收益等汇总指标）",
  insurance: "保险保单",
  market: "市场数据关联（行情 / 组合量化指标进入 AI 分析）",
};

/** 单条审计日志：谁（accessor）在什么时候（at）以什么用途（purpose）读了哪些作用域。 */
export interface DataAccessLogEntry {
  at: string;
  accessor: string;
  purpose: string;
  scopes: DataScope[];
  /** 因用户关闭授权而被裁剪掉的作用域。 */
  deniedScopes: DataScope[];
}

export interface ConsentRecord {
  userId: string;
  /** 各作用域授权开关；缺省视为 true（opt-out 模式）。 */
  scopes: Record<DataScope, boolean>;
  auditLog: DataAccessLogEntry[];
  updatedAt: string;
  version: 1;
}

function sanitize(userId: string): string {
  const clean = userId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!clean) throw new Error("非法 userId");
  return clean;
}

function defaultRecord(userId: string): ConsentRecord {
  return {
    userId,
    scopes: { cashflow: true, investments: true, assets: true, insurance: true, market: true },
    auditLog: [],
    updatedAt: new Date().toISOString(),
    version: 1,
  };
}

function filePath(userId: string): string {
  return join(DATA_DIR, `${sanitize(userId)}.json`);
}

function load(userId: string): ConsentRecord {
  const path = filePath(userId);
  if (!existsSync(path)) return defaultRecord(sanitize(userId));
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as Partial<ConsentRecord>;
    const base = defaultRecord(sanitize(userId));
    return {
      ...base,
      ...raw,
      userId: base.userId,
      scopes: { ...base.scopes, ...(raw.scopes ?? {}) },
      auditLog: Array.isArray(raw.auditLog) ? raw.auditLog.slice(-MAX_AUDIT_ENTRIES) : [],
      version: 1,
    };
  } catch {
    return defaultRecord(sanitize(userId));
  }
}

function persist(record: ConsentRecord): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  record.updatedAt = new Date().toISOString();
  writeFileSync(filePath(record.userId), JSON.stringify(record, null, 2), "utf-8");
}

/** 读取用户授权设置（无记录时返回默认全授权）。 */
export function getUserConsent(userId: string): ConsentRecord {
  return load(userId);
}

/** 更新一个或多个作用域开关。 */
export function setUserConsent(
  userId: string,
  patch: Partial<Record<DataScope, boolean>>
): ConsentRecord {
  const record = load(userId);
  for (const scope of DATA_SCOPES) {
    if (typeof patch[scope] === "boolean") record.scopes[scope] = patch[scope]!;
  }
  persist(record);
  return record;
}

/** 判断某作用域是否已授权。 */
export function hasConsent(userId: string, scope: DataScope): boolean {
  return load(userId).scopes[scope] !== false;
}

/** 落审计日志（追加，容量上限 200 条，失败不影响主流程）。 */
export function logDataAccess(
  userId: string,
  entry: Omit<DataAccessLogEntry, "at">
): void {
  try {
    const record = load(userId);
    record.auditLog.push({ at: new Date().toISOString(), ...entry });
    if (record.auditLog.length > MAX_AUDIT_ENTRIES) {
      record.auditLog = record.auditLog.slice(-MAX_AUDIT_ENTRIES);
    }
    persist(record);
  } catch {
    /* 审计失败不阻塞 AI 主流程 */
  }
}

type RealData = NonNullable<FinancialContextData["realData"]>;

export interface ConsentFilterResult {
  /** 裁剪后的 realData；全部作用域被关闭时为 undefined（等价于无真实数据）。 */
  realData: RealData | undefined;
  /** 实际放行的作用域。 */
  grantedScopes: DataScope[];
  /** 被用户关闭而裁剪掉的作用域。 */
  deniedScopes: DataScope[];
}

/**
 * 按用户授权对 realData 做字段级裁剪。
 *
 * 作用域 → 字段映射：
 *  - cashflow    → avgMonthlyIncome/avgMonthlyExpense/avgSavingsRate/monthlyCashFlow/topCategories/transactionCount/dateRange
 *  - investments → holdings（持仓明细）
 *  - assets      → totalInvestment/totalProfit（汇总指标）
 *  - insurance   → （保单目前不在 realData 中，预留）
 */
export function filterRealDataByConsent(
  userId: string,
  realData: RealData | undefined
): ConsentFilterResult {
  if (!realData) return { realData: undefined, grantedScopes: [], deniedScopes: [] };

  const consent = load(userId);
  const granted: DataScope[] = [];
  const denied: DataScope[] = [];
  for (const scope of ["cashflow", "investments", "assets"] as DataScope[]) {
    (consent.scopes[scope] !== false ? granted : denied).push(scope);
  }

  if (granted.length === 0) {
    return { realData: undefined, grantedScopes: [], deniedScopes: denied };
  }

  const filtered: RealData = { ...realData };
  if (consent.scopes.cashflow === false) {
    filtered.avgMonthlyIncome = 0;
    filtered.avgMonthlyExpense = 0;
    filtered.avgSavingsRate = 0;
    filtered.monthlyCashFlow = [];
    filtered.topCategories = [];
    filtered.transactionCount = 0;
    filtered.dateRange = null;
  }
  if (consent.scopes.investments === false) {
    filtered.holdings = [];
  }
  if (consent.scopes.assets === false) {
    filtered.totalInvestment = 0;
    filtered.totalProfit = 0;
  }

  // 裁剪后已无任何有效信息 → 视为无真实数据，避免 LLM 收到全零误导
  const meaningless =
    filtered.monthlyCashFlow.length === 0 &&
    filtered.holdings.length === 0 &&
    filtered.totalInvestment === 0;
  if (meaningless) {
    return { realData: undefined, grantedScopes: granted, deniedScopes: denied };
  }

  return { realData: filtered, grantedScopes: granted, deniedScopes: denied };
}
