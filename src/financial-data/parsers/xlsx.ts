import "server-only";

/**
 * XLSX 解析器 —— 无第三方依赖。
 * 通过内置 ZIP reader 解压，读取 sharedStrings 与首个 worksheet 的单元格，
 * 还原为二维表，再复用 CSV 的表头映射逻辑输出 RawRecord[]。
 */

import type { RawRecord } from "../types";
import { unzip } from "./zip";
import { rowsToRecords } from "./rows";

/** 提取所有 <t>...</t> 文本（sharedStrings） */
function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  // 每个 <si> 是一个共享字符串，可能含多个 <t>（富文本）
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRegex.exec(xml)) !== null) {
    const inner = m[1];
    const texts: string[] = [];
    const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let tm: RegExpExecArray | null;
    while ((tm = tRegex.exec(inner)) !== null) {
      texts.push(decodeXml(tm[1]));
    }
    strings.push(texts.join(""));
  }
  return strings;
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, "&");
}

/** 将 A1 样式列号转为 0-based 列索引 */
function colToIndex(ref: string): number {
  const letters = ref.replace(/\d+/g, "");
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx - 1;
}

/** 解析 worksheet XML 为二维数组 */
function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRegex.exec(xml)) !== null) {
    const rowXml = rm[1];
    const cells: string[] = [];
    const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRegex.exec(rowXml)) !== null) {
      const attrs = cm[1] ?? cm[3] ?? "";
      const body = cm[2] ?? "";
      const refMatch = attrs.match(/r="([A-Z]+)\d+"/);
      const typeMatch = attrs.match(/t="([^"]+)"/);
      const colIdx = refMatch ? colToIndex(refMatch[1]) : cells.length;

      let value = "";
      const vMatch = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
      const isMatch = body.match(/<t\b[^>]*>([\s\S]*?)<\/t>/); // inline string
      if (typeMatch && typeMatch[1] === "s" && vMatch) {
        const sIdx = Number(vMatch[1]);
        value = shared[sIdx] ?? "";
      } else if (typeMatch && typeMatch[1] === "inlineStr" && isMatch) {
        value = decodeXml(isMatch[1]);
      } else if (vMatch) {
        value = decodeXml(vMatch[1]);
      }
      // 填充空列
      while (cells.length < colIdx) cells.push("");
      cells[colIdx] = value;
    }
    rows.push(cells);
  }
  return rows;
}

/** 找到第一个 worksheet 的路径 */
function firstSheetPath(entries: Map<string, Buffer>): string | null {
  // 优先 sheet1
  if (entries.has("xl/worksheets/sheet1.xml")) return "xl/worksheets/sheet1.xml";
  for (const key of entries.keys()) {
    if (/^xl\/worksheets\/sheet\d+\.xml$/.test(key)) return key;
  }
  return null;
}

/** 解析 xlsx（base64 或 Buffer）为 RawRecord[] */
export function parseXlsx(buf: Buffer): {
  records: RawRecord[];
  warnings: string[];
} {
  const warnings: string[] = [];
  let entries: Map<string, Buffer>;
  try {
    entries = unzip(buf);
  } catch {
    return { records: [], warnings: ["xlsx 解压失败，文件可能已损坏"] };
  }

  const sheetPath = firstSheetPath(entries);
  if (!sheetPath) {
    return { records: [], warnings: ["未找到 worksheet"] };
  }

  const sharedBuf = entries.get("xl/sharedStrings.xml");
  const shared = sharedBuf ? parseSharedStrings(sharedBuf.toString("utf8")) : [];
  const sheetXml = entries.get(sheetPath)!.toString("utf8");
  const rows = parseSheet(sheetXml, shared);

  if (rows.length === 0) {
    return { records: [], warnings: ["worksheet 为空"] };
  }

  const { records, warnings: rowWarnings } = rowsToRecords(rows);
  warnings.push(...rowWarnings);
  return { records, warnings };
}
