import "server-only";

/**
 * Financial Parser 分发入口。
 * 按文件格式路由到 CSV / XLSX / PDF 解析器，输出原始记录 RawRecord[]。
 * 保险 PDF 输出纯文本，由上层 normalizer 抽取字段。
 */

import type { FileFormat, ImportSource, RawRecord } from "../types";
import { parseCsv } from "./csv";
import { parseXlsx } from "./xlsx";
import { extractPdfText } from "./pdf";

export interface ParseInput {
  source: ImportSource;
  fileName: string;
  /** 文本内容（csv/json/txt）或 base64（xlsx/pdf） */
  content: string;
  encoding: "utf8" | "base64";
}

export interface ParseOutput {
  format: FileFormat;
  /** 结构化记录（交易 / 持仓类文件） */
  records: RawRecord[];
  /** 纯文本（保险 PDF 类文件） */
  text?: string;
  warnings: string[];
}

/** 根据文件名推断格式 */
export function detectFormat(fileName: string): FileFormat {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "csv") return "csv";
  if (ext === "xlsx") return "xlsx";
  if (ext === "xls") return "xls";
  if (ext === "pdf") return "pdf";
  if (ext === "json") return "json";
  return "txt";
}

/** 主解析函数 */
export function parseFile(input: ParseInput): ParseOutput {
  const format = detectFormat(input.fileName);
  const warnings: string[] = [];

  switch (format) {
    case "csv":
    case "txt": {
      const text =
        input.encoding === "base64"
          ? Buffer.from(input.content, "base64").toString("utf8")
          : input.content;
      const { records, warnings: w } = parseCsv(text);
      return { format, records, warnings: w };
    }
    case "json": {
      const text =
        input.encoding === "base64"
          ? Buffer.from(input.content, "base64").toString("utf8")
          : input.content;
      return { format, ...parseJson(text) };
    }
    case "xlsx": {
      const buf =
        input.encoding === "base64"
          ? Buffer.from(input.content, "base64")
          : Buffer.from(input.content, "utf8");
      const { records, warnings: w } = parseXlsx(buf);
      return { format, records, warnings: w };
    }
    case "xls": {
      warnings.push("暂不支持旧版 .xls 二进制格式，请另存为 .xlsx 或导出 CSV");
      return { format, records: [], warnings };
    }
    case "pdf": {
      const buf =
        input.encoding === "base64"
          ? Buffer.from(input.content, "base64")
          : Buffer.from(input.content, "latin1");
      const { text, warnings: w } = extractPdfText(buf);
      return { format, records: [], text, warnings: w };
    }
    default:
      warnings.push(`不支持的文件格式: ${format}`);
      return { format, records: [], warnings };
  }
}

/** 解析 JSON 数组为 RawRecord[]（宽松映射） */
function parseJson(text: string): { records: RawRecord[]; warnings: string[] } {
  const warnings: string[] = [];
  try {
    const data = JSON.parse(text);
    const arr: unknown[] = Array.isArray(data)
      ? data
      : Array.isArray((data as Record<string, unknown>)?.records)
        ? ((data as Record<string, unknown>).records as unknown[])
        : [];
    if (arr.length === 0) {
      warnings.push("JSON 中未找到记录数组");
      return { records: [], warnings };
    }
    const records: RawRecord[] = arr.map((row, i) => {
      const obj = (row ?? {}) as Record<string, unknown>;
      const fields: Record<string, string> = {};
      for (const [k, v] of Object.entries(obj)) {
        fields[k] = v == null ? "" : String(v);
      }
      return {
        fields,
        rowIndex: i + 1,
        date: fields.date ?? fields["日期"],
        amount: fields.amount ?? fields["金额"],
        description: fields.description ?? fields["摘要"],
        merchant: fields.merchant ?? fields["商户"],
        rawType: fields.type ?? fields["收支"],
      };
    });
    return { records, warnings };
  } catch {
    return { records: [], warnings: ["JSON 解析失败"] };
  }
}

export { parseCsv } from "./csv";
export { parseXlsx } from "./xlsx";
export { extractPdfText } from "./pdf";
