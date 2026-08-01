import "server-only";

/**
 * Confirm & Apply（需求六 / 七）—— 用户确认后写入财富画像。
 *
 *  确认前：DocumentAnalysis.status = needs_confirm，数据仅存于分析记录；
 *  确认后：
 *    1. 抽取实体写入个人金融数据库（financeDb.saveImport，增量合并 + 去重）；
 *    2. rebuildTwinFromData 重算 Financial Twin（净资产 / 现金流 / 风险 / 目标进度）；
 *    3. detectChanges + invalidateUser 失效 AI 分析缓存（复用 Phase 6.5 管线）；
 *    4. 分析记录标记 confirmed + appliedAt。
 */

import { financeDb } from "@/financial-data/storage";
import {
  rebuildTwinFromData,
  type TwinRebuildResult,
} from "@/financial-data/twin-builder";
import { profileManager } from "@/financial-profile";
import { detectChanges } from "@/ai/orchestration/change-detector";
import type { ChangeReport } from "@/ai/orchestration/types";
import { invalidateUser } from "@/ai/orchestration/cache-manager";
import type { ImportBatch } from "@/financial-data/types";
import { analysisStore } from "./storage";
import type { DocumentAnalysis } from "./types";

export interface ApplyResult {
  ok: boolean;
  error?: string;
  analysis?: DocumentAnalysis;
  batch?: ImportBatch;
  twin?: TwinRebuildResult;
  changes?: ChangeReport;
}

/** 用户确认：把 AI 识别结果写入财富画像并重算 Twin */
export async function applyAnalysis(
  userId: string,
  analysisId: string
): Promise<ApplyResult> {
  const analysis = analysisStore.get(userId, analysisId);
  if (!analysis) {
    return { ok: false, error: "分析记录不存在" };
  }
  if (analysis.status === "confirmed") {
    return { ok: false, error: "该资料已确认写入，请勿重复操作", analysis };
  }
  if (analysis.status !== "needs_confirm") {
    return { ok: false, error: "该资料尚未完成识别，无法确认", analysis };
  }

  const { transactions, holdings, policies } = analysis.extracted;
  if (
    transactions.length === 0 &&
    holdings.length === 0 &&
    policies.length === 0
  ) {
    return { ok: false, error: "该资料没有可写入的金融数据", analysis };
  }

  const prevProfile = profileManager.getProfile(userId)?.profile ?? null;

  // ---- 1. 写入个人金融数据库（增量合并 + 指纹去重） ----
  const format =
    analysis.mimeType.startsWith("image/") ? "txt" : inferFormat(analysis.fileName);
  const { batch } = financeDb.saveImport({
    userId,
    source: analysis.source,
    fileName: analysis.fileName,
    format,
    transactions: transactions.length ? transactions : undefined,
    holdings: holdings.length ? holdings : undefined,
    policies: policies.length ? policies : undefined,
    warnings: analysis.warnings,
  });

  // ---- 2. 重算 Financial Twin ----
  const twin = rebuildTwinFromData(userId);

  // ---- 3. 失效 AI 缓存（Phase 6.5 管线） ----
  let changes: ChangeReport | undefined;
  try {
    const nextProfile = profileManager.getProfile(userId)?.profile;
    if (nextProfile) {
      changes = detectChanges(prevProfile, nextProfile);
      if (changes.changeScore !== "low") {
        await invalidateUser(userId);
      }
    }
  } catch {
    /* 缓存失效失败不阻塞主流程 */
  }

  // ---- 4. 标记 confirmed ----
  const updated = analysisStore.update(userId, analysisId, {
    status: "confirmed",
    appliedAt: new Date().toISOString(),
  });

  return { ok: true, analysis: updated ?? analysis, batch, twin, changes };
}

function inferFormat(fileName: string): ImportBatch["format"] {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "csv") return "csv";
  if (ext === "xlsx") return "xlsx";
  if (ext === "pdf") return "pdf";
  if (ext === "json") return "json";
  return "txt";
}
