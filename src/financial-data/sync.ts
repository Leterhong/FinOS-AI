import "server-only";

/**
 * Data Sync Service —— 数据导入 / 同步编排。
 * 完整管道：解析(Parser) → 归一化(Normalizer) → 分类(Classifier)
 *          → 加密入库(FinanceDb) → 重建孪生(TwinBuilder)。
 * 手动上传与定期同步共用同一管道；未来接入开放银行 API 时
 * 只需新增 fetch 型 connector，管道不变。
 */

import { getConnector } from "./connectors";
import { parseFile } from "./parsers";
import {
  normalizeTransactions,
  normalizeHoldings,
  extractPolicyFromText,
} from "./normalizer";
import { classifyTransactions } from "./classifier";
import { financeDb } from "./storage";
import { buildSummary } from "./summary";
import { rebuildTwinFromData, type TwinRebuildResult } from "./twin-builder";
import type { DatasetMeta, FinancialDataSummary, ImportBatch, ImportRequest } from "./types";

export interface SyncResult {
  ok: boolean;
  batch?: ImportBatch;
  meta?: DatasetMeta;
  summary?: FinancialDataSummary;
  twin?: TwinRebuildResult;
  error?: string;
}

/** 导入一个文件并走完整管道 */
export async function importFinancialFile(req: ImportRequest): Promise<SyncResult> {
  try {
    const connector = getConnector(req.source);

    // ---- 1. 解析 ----
    const parsed = parseFile({
      source: req.source,
      fileName: req.fileName,
      content: req.content,
      encoding: req.encoding,
    });

    if (!connector.formats.includes(parsed.format)) {
      return {
        ok: false,
        error: `「${connector.label}」不支持 ${parsed.format} 格式，请上传 ${connector.formats.join(" / ")}`,
      };
    }

    const warnings = [...parsed.warnings];
    let transactionDrafts = 0;
    let saved: { batch: ImportBatch } | null = null;

    // ---- 2/3. 归一化 + 分类 ----
    if (connector.output === "transactions") {
      const { drafts, warnings: nw } = normalizeTransactions(parsed.records, req.source);
      warnings.push(...nw);
      transactionDrafts = drafts.length;
      if (drafts.length === 0) {
        return { ok: false, error: "未解析到有效交易记录", meta: buildMeta(req, parsed.records.length, 0, warnings) };
      }
      const classified = await classifyTransactions(drafts);
      warnings.push(...classified.warnings);
      saved = financeDb.saveImport({
        userId: req.userId,
        source: req.source,
        fileName: req.fileName,
        format: parsed.format,
        transactions: classified.transactions,
        warnings,
      });
    } else if (connector.output === "holdings") {
      const { drafts, warnings: nw } = normalizeHoldings(parsed.records, req.source);
      warnings.push(...nw);
      if (drafts.length === 0) {
        return { ok: false, error: "未解析到有效持仓记录", meta: buildMeta(req, parsed.records.length, 0, warnings) };
      }
      saved = financeDb.saveImport({
        userId: req.userId,
        source: req.source,
        fileName: req.fileName,
        format: parsed.format,
        holdings: drafts,
        warnings,
      });
    } else {
      // policy（保险 PDF）
      const { draft, warnings: pw } = extractPolicyFromText(parsed.text ?? "", req.source);
      warnings.push(...pw);
      if (!draft) {
        return { ok: false, error: "未能从保险合同中抽取有效信息", meta: buildMeta(req, 0, 0, warnings) };
      }
      saved = financeDb.saveImport({
        userId: req.userId,
        source: req.source,
        fileName: req.fileName,
        format: parsed.format,
        policies: [draft],
        warnings,
      });
    }

    // ---- 4. 重建 Twin ----
    const twin = rebuildTwinFromData(req.userId);

    const parsedCount =
      connector.output === "transactions"
        ? transactionDrafts
        : saved.batch.holdingCount + saved.batch.policyCount;

    return {
      ok: true,
      batch: saved.batch,
      meta: buildMeta(req, parsed.records.length || parsedCount, parsedCount, warnings),
      summary: twin.summary,
      twin,
    };
  } catch (err) {
    return { ok: false, error: `导入失败: ${(err as Error).message}` };
  }
}

/** 获取用户数据摘要（Dashboard / Agent 消费） */
export function getFinancialSummary(userId: string): FinancialDataSummary {
  const record = financeDb.load(userId);
  return buildSummary({
    userId,
    transactions: record.transactions,
    holdings: record.holdings,
    imports: record.imports,
    updatedAt: financeDb.hasData(userId) ? record.updatedAt : null,
  });
}

/** 手动触发数据刷新（重建 Twin + 摘要），供「数据刷新」按钮 / 定期同步调用 */
export function refreshFinancialData(userId: string): TwinRebuildResult {
  return rebuildTwinFromData(userId);
}

export interface QuoteSyncResult {
  ok: boolean;
  /** 更新的持仓数量 */
  updatedCount: number;
  /** 数据源是否为模拟数据 */
  simulated: boolean;
  /** 同步时间 ISO */
  syncedAt: string;
  twin?: TwinRebuildResult;
  error?: string;
}

/**
 * 行情同步：用 Provider 最新报价刷新股票 / 基金持仓的价格与市值，
 * 然后重建 Financial Twin。持仓需带 code 才能匹配报价。
 */
export async function syncHoldingQuotes(userId: string): Promise<QuoteSyncResult> {
  const syncedAt = new Date().toISOString();
  try {
    const { getStockProvider, getFundProvider } = await import("./providers");
    const holdings = financeDb.getHoldings(userId);
    const stockCodes = [...new Set(
      holdings.filter((h) => h.type === "stock" && h.code).map((h) => h.code!),
    )];
    const fundCodes = [...new Set(
      holdings.filter((h) => h.type === "fund" && h.code).map((h) => h.code!),
    )];
    if (stockCodes.length === 0 && fundCodes.length === 0) {
      return {
        ok: true,
        updatedCount: 0,
        simulated: getStockProvider().simulated,
        syncedAt,
        twin: rebuildTwinFromData(userId),
      };
    }

    const stockProvider = getStockProvider();
    const fundProvider = getFundProvider();
    const [stockQuotes, fundQuotes] = await Promise.all([
      stockProvider.getQuotes(stockCodes),
      fundProvider.getQuotes(fundCodes),
    ]);
    const quoteMap = new Map(
      [...stockQuotes, ...fundQuotes].map((q) => [q.code, q]),
    );

    let updatedCount = 0;
    for (const h of holdings) {
      if (!h.code) continue;
      const quote = quoteMap.get(h.code);
      if (!quote) continue;
      const patch: { marketValue?: number; cost?: number } = {};
      if (h.shares && h.shares > 0) {
        patch.marketValue = Math.round(quote.price * h.shares * 100) / 100;
      }
      if (patch.marketValue != null) {
        financeDb.updateHolding(userId, h.id, patch);
        updatedCount++;
      }
    }

    const twin = rebuildTwinFromData(userId);
    return {
      ok: true,
      updatedCount,
      simulated: stockProvider.simulated || fundProvider.simulated,
      syncedAt,
      twin,
    };
  } catch (err) {
    return {
      ok: false,
      updatedCount: 0,
      simulated: true,
      syncedAt,
      error: `行情同步失败: ${(err as Error).message}`,
    };
  }
}

function buildMeta(
  req: ImportRequest,
  rowCount: number,
  parsedCount: number,
  warnings: string[],
): DatasetMeta {
  return {
    source: req.source,
    format: req.fileName.toLowerCase().endsWith(".pdf")
      ? "pdf"
      : req.fileName.toLowerCase().endsWith(".xlsx")
        ? "xlsx"
        : "csv",
    fileName: req.fileName,
    rowCount,
    parsedCount,
    skippedCount: Math.max(rowCount - parsedCount, 0),
    warnings,
  };
}
