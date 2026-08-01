import "server-only";

/**
 * Document Intelligence Pipeline（需求三）—— 处理流程编排。
 *
 *  用户上传文件 → Document Hash 去重（需求十二：同文件只分析一次）
 *    → 文档类型识别 → 文件解析（PDF/Excel/CSV/TXT）或 Vision/OCR（图片）
 *    → Financial Extraction Agent → Data Validator
 *    → 保存 DocumentAnalysis（status=needs_confirm，等待用户确认）
 *
 *  AI 识别结果绝不直接写入财富画像（需求六）；
 *  确认写入由 apply.ts 的 applyAnalysis 负责。
 */

import { createHash } from "node:crypto";
import { analysisStore, newAnalysisId } from "../storage";
import {
  detectDocKind,
  isImage,
  parseForAnalysis,
  resolveSource,
} from "../parser";
import { analyzeImage } from "../vision";
import { extractFinancialData } from "../extractor";
import { validateExtracted } from "../validator";
import {
  emptyStructuredData,
  type AnalyzeInput,
  type AnalyzeResult,
  type DocumentAnalysis,
} from "../types";

/** 计算文件内容 sha256（Document Hash） */
export function hashDocument(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

/** 文档 AI 理解主入口 */
export async function analyzeDocument(
  input: AnalyzeInput
): Promise<AnalyzeResult> {
  const hash = hashDocument(input.content);

  // ---- 0. Document Hash 去重：同内容文件直接复用既有分析 ----
  if (!input.force) {
    const existing = analysisStore.findByHash(input.userId, hash);
    if (existing) {
      // 新文档关联到既有分析结果（复制一条挂到新 docId，避免跨文档引用混乱）
      if (existing.docId !== input.docId) {
        const cloned = analysisStore.save({
          ...existing,
          id: newAnalysisId(),
          docId: input.docId,
          fileName: input.fileName,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          warnings: [
            ...existing.warnings,
            "命中同内容文件的既有分析结果（未重复消耗 AI 分析）",
          ],
        });
        return { analysis: cloned, cached: true };
      }
      return { analysis: existing, cached: true };
    }
  }

  const now = new Date().toISOString();
  const base: DocumentAnalysis = {
    id: newAnalysisId(),
    userId: input.userId,
    docId: input.docId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    hash,
    kind: "unknown",
    source: "manual",
    status: "processing",
    ocrUsed: false,
    visionUsed: false,
    extracted: emptyStructuredData(),
    validation: { ok: false, issues: [], droppedCount: 0 },
    warnings: [],
    createdAt: now,
    updatedAt: now,
  };

  try {
    let records = [] as Awaited<ReturnType<typeof analyzeImage>>["records"];
    let text = "";
    const warnings: string[] = [];

    if (isImage(input.mimeType)) {
      // ---- 图片：Vision Agent（需求八），失败即优雅降级 ----
      base.visionUsed = true;
      const vision = await analyzeImage({
        userId: input.userId,
        image: input.content,
        mimeType: input.mimeType,
      });
      if (!vision.ok) {
        const failed = analysisStore.save({
          ...base,
          status: "failed",
          error: vision.error,
        });
        return { analysis: failed, cached: false };
      }
      records = vision.records;
      text = vision.text;
      base.ocrUsed = vision.records.length === 0 && Boolean(vision.text);
      warnings.push(...vision.warnings);
      base.kind =
        vision.kindHint ??
        detectDocKind({ fileName: input.fileName, records, text });
    } else {
      // ---- 文件：零依赖解析器 ----
      const parsed = parseForAnalysis(input.fileName, input.content);
      records = parsed.records;
      text = parsed.text;
      warnings.push(...parsed.warnings);
      base.kind = detectDocKind({ fileName: input.fileName, records, text });
    }

    base.source = resolveSource(
      base.kind,
      `${input.fileName} ${text.slice(0, 500)}`
    );

    // ---- 抽取 + 验证 ----
    const { data, warnings: ew } = await extractFinancialData({
      kind: base.kind,
      source: base.source,
      records,
      text,
    });
    warnings.push(...ew);
    const { cleaned, report } = validateExtracted(data);

    // ---- 数据可信度评分（需求九）----
    // 结构化表格（CSV/XLSX/结构化 PDF）→ 95；纯文本抽取（PDF 版式可能丢失）→ 88；
    // 视觉识别 Vision → 75；OCR 降级 → 60；几乎无可用信息 → 50。
    let confidence: number;
    if (base.visionUsed) {
      confidence = base.ocrUsed ? 60 : 75;
    } else if (records.length > 0) {
      confidence = 95;
    } else if (text) {
      confidence = 88;
    } else {
      confidence = 50;
    }

    const analysis = analysisStore.save({
      ...base,
      status: report.ok ? "needs_confirm" : "failed",
      error: report.ok
        ? undefined
        : report.issues.find((i) => i.level === "error")?.message,
      extracted: cleaned,
      validation: report,
      warnings,
      confidence,
      textPreview: text ? text.slice(0, 400) : undefined,
    });
    return { analysis, cached: false };
  } catch (err) {
    const failed = analysisStore.save({
      ...base,
      status: "failed",
      error: `分析失败：${(err as Error).message}`,
    });
    return { analysis: failed, cached: false };
  }
}
