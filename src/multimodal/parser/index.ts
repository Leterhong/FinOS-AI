import "server-only";

/**
 * Multimodal Parser —— 文档类型识别 + 文件解析（需求二 / 三第 2-3 步）。
 *  - detectDocKind：文件名关键词 → 表头特征 → 文本内容关键词 三级识别；
 *  - parseForAnalysis：非图片文件复用 financial-data 零依赖解析器
 *    （CSV / XLSX / JSON / TXT → RawRecord[]；PDF → 纯文本）；
 *  - 图片文件由 vision / ocr 层处理，本层只负责识别与分流。
 */

import { parseFile, detectFormat } from "@/financial-data/parsers";
import type { FileFormat, RawRecord } from "@/financial-data/types";
import { KIND_TO_SOURCE, type MultimodalDocKind } from "../types";
import type { ImportSource } from "@/financial-data/types";

/** 图片 MIME 白名单 */
export const IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp"];

export function isImage(mimeType: string): boolean {
  return IMAGE_MIMES.includes(mimeType);
}

/* -------------------------------------------------------------------------- */
/*  文档类型识别                                                                 */
/* -------------------------------------------------------------------------- */

interface KindRule {
  kind: MultimodalDocKind;
  patterns: RegExp[];
}

/** 文件名 / 文本关键词规则（顺序即优先级） */
const KIND_RULES: KindRule[] = [
  {
    kind: "payslip",
    patterns: [/工资|薪资|薪酬|月薪|payroll|payslip|salary/i],
  },
  {
    kind: "insurance",
    patterns: [/保险|保单|保费|policy|insurance|重疾|寿险|年金/i],
  },
  {
    kind: "bank-statement",
    patterns: [/流水|对账单|交易明细|bank.?statement|transactions?/i],
  },
  {
    kind: "expense",
    patterns: [/消费|账单|信用卡|credit.?card|expense|bill/i],
  },
  {
    kind: "holdings",
    patterns: [/持仓|股票|基金|证券|positions?|holdings?|stock|fund|portfolio/i],
  },
  {
    kind: "investment-report",
    patterns: [/投资报告|理财报告|investment.?report/i],
  },
  {
    kind: "asset-sheet",
    patterns: [/资产|净值表|assets?/i],
  },
];

function matchKind(text: string): MultimodalDocKind | null {
  for (const rule of KIND_RULES) {
    if (rule.patterns.some((p) => p.test(text))) return rule.kind;
  }
  return null;
}

/** 表头特征识别（结构化记录的 fields 键名） */
function kindFromRecords(records: RawRecord[]): MultimodalDocKind | null {
  if (records.length === 0) return null;
  const keys = Object.keys(records[0].fields).join("|").toLowerCase();
  if (/份额|净值|市值|持仓|成本|shares|nav|market.?value|price/.test(keys)) {
    return "holdings";
  }
  if (/余额|balance/.test(keys) && /金额|amount/.test(keys)) {
    return "bank-statement";
  }
  if (/商户|merchant/.test(keys)) return "expense";
  if (/工资|实发|应发|salary/.test(keys)) return "payslip";
  return null;
}

/**
 * 三级文档类型识别：
 *  1. 文件名关键词；2. 表头特征；3. 解析文本内容关键词。
 */
export function detectDocKind(input: {
  fileName: string;
  records?: RawRecord[];
  text?: string;
}): MultimodalDocKind {
  const byName = matchKind(input.fileName);
  if (byName) return byName;
  const byHeader = input.records ? kindFromRecords(input.records) : null;
  if (byHeader) return byHeader;
  const byText = input.text ? matchKind(input.text.slice(0, 2000)) : null;
  if (byText) return byText;
  return "unknown";
}

/** kind → 导入数据源（持仓类根据内容细分 stock/fund） */
export function resolveSource(
  kind: MultimodalDocKind,
  sample?: string
): ImportSource {
  if (kind === "holdings" && sample && /基金|fund|净值/i.test(sample)) {
    return "fund";
  }
  return KIND_TO_SOURCE[kind];
}

/* -------------------------------------------------------------------------- */
/*  非图片文件解析                                                               */
/* -------------------------------------------------------------------------- */

export interface ParsedForAnalysis {
  format: FileFormat;
  records: RawRecord[];
  text: string;
  warnings: string[];
}

/** 解析非图片文件（复用 financial-data 零依赖解析器） */
export function parseForAnalysis(
  fileName: string,
  content: Buffer
): ParsedForAnalysis {
  const format = detectFormat(fileName);
  const isBinary = format === "xlsx" || format === "xls" || format === "pdf";
  const out = parseFile({
    source: "manual",
    fileName,
    content: isBinary ? content.toString("base64") : content.toString("utf8"),
    encoding: isBinary ? "base64" : "utf8",
  });
  return {
    format: out.format,
    records: out.records,
    text: out.text ?? "",
    warnings: out.warnings,
  };
}
