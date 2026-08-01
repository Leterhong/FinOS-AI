import "server-only";

/**
 * 行情缓存（Phase 6.9 需求十三 / 验收测试 5）。
 *  - 每用户独立加密文件 .data/finance-cache/{userId}.json（AES-256-GCM）。
 *  - 数据源成功 → 覆盖缓存；数据源失败 → 读缓存并明确提示「缓存数据」。
 *  - 附带组合价值日快照（收益曲线数据，纯代码累积，零 LLM）。
 */

import fs from "node:fs";
import path from "node:path";
import { encryptToFileString, parseSecureFileString } from "@/security";
import type {
  FundNAV,
  MarketIndexQuote,
  PortfolioValuePoint,
  StockQuote,
} from "../types";

const BASE_DIR = path.join(process.cwd(), ".data", "finance-cache");
/** 收益曲线最多保留天数 */
const MAX_HISTORY_POINTS = 366;

export interface FinanceCacheState {
  quotes: Record<string, StockQuote>;
  navs: Record<string, FundNAV>;
  indices: Record<string, MarketIndexQuote>;
  /** 组合价值日快照（收益曲线） */
  portfolioHistory: PortfolioValuePoint[];
  updatedAt: string;
}

function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
}

function fileOf(userId: string): string {
  return path.join(BASE_DIR, `${sanitize(userId)}.json`);
}

function emptyState(): FinanceCacheState {
  return {
    quotes: {},
    navs: {},
    indices: {},
    portfolioHistory: [],
    updatedAt: "",
  };
}

export function readFinanceCache(userId: string): FinanceCacheState {
  try {
    const fp = fileOf(userId);
    if (!fs.existsSync(fp)) return emptyState();
    const parsed = parseSecureFileString<FinanceCacheState>(fs.readFileSync(fp, "utf-8"));
    const v = parsed?.value;
    if (!v || typeof v !== "object") return emptyState();
    return {
      quotes: v.quotes ?? {},
      navs: v.navs ?? {},
      indices: v.indices ?? {},
      portfolioHistory: Array.isArray(v.portfolioHistory) ? v.portfolioHistory : [],
      updatedAt: v.updatedAt ?? "",
    };
  } catch {
    return emptyState();
  }
}

function writeState(userId: string, state: FinanceCacheState): void {
  if (!fs.existsSync(BASE_DIR)) fs.mkdirSync(BASE_DIR, { recursive: true });
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(fileOf(userId), encryptToFileString(state), "utf-8");
}

/** 成功行情写入缓存（合并语义） */
export function saveQuotesToCache(
  userId: string,
  data: { quotes?: StockQuote[]; navs?: FundNAV[]; indices?: MarketIndexQuote[] },
): void {
  const state = readFinanceCache(userId);
  for (const q of data.quotes ?? []) state.quotes[q.symbol] = q;
  for (const n of data.navs ?? []) state.navs[n.code] = n;
  for (const i of data.indices ?? []) state.indices[i.code] = i;
  writeState(userId, state);
}

/** 记录组合价值日快照（同日覆盖，供收益曲线） */
export function recordPortfolioSnapshot(
  userId: string,
  point: PortfolioValuePoint,
): PortfolioValuePoint[] {
  const state = readFinanceCache(userId);
  const idx = state.portfolioHistory.findIndex((p) => p.date === point.date);
  if (idx >= 0) state.portfolioHistory[idx] = point;
  else state.portfolioHistory.push(point);
  state.portfolioHistory.sort((a, b) => a.date.localeCompare(b.date));
  if (state.portfolioHistory.length > MAX_HISTORY_POINTS) {
    state.portfolioHistory = state.portfolioHistory.slice(-MAX_HISTORY_POINTS);
  }
  writeState(userId, state);
  return state.portfolioHistory;
}

export function getPortfolioHistory(userId: string): PortfolioValuePoint[] {
  return readFinanceCache(userId).portfolioHistory;
}

export function clearFinanceCache(userId: string): void {
  try {
    const fp = fileOf(userId);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch {
    /* ignore */
  }
}
