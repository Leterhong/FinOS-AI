/**
 * CSV 解析器 —— 原生实现，无第三方依赖。
 * 支持逗号 / 制表符 / 分号分隔，带引号转义。
 * 负责把 CSV 文本切成二维表，交由共享的 rowsToRecords 做表头映射。
 */

import type { RawRecord } from "../types";
import { rowsToRecords } from "./rows";

/** 检测分隔符 */
function detectDelimiter(headerLine: string): string {
  const candidates = [",", "\t", ";", "|"];
  let best = ",";
  let bestCount = -1;
  for (const d of candidates) {
    const count = headerLine.split(d).length;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

/** 解析单行（处理引号包裹与转义） */
function parseLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/** 解析 CSV 文本为 RawRecord[] */
export function parseCsv(text: string): {
  records: RawRecord[];
  warnings: string[];
} {
  // 去除 BOM
  const clean = text.replace(/^\uFEFF/, "");
  const rawLines = clean.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
  if (rawLines.length === 0) {
    return { records: [], warnings: ["文件为空"] };
  }

  // 用出现最多的分隔符统一切分（以首个数据密集行为准）
  const delimiter = detectDelimiter(rawLines[0]);
  const rows = rawLines.map((line) => parseLine(line, delimiter));
  return rowsToRecords(rows);
}
