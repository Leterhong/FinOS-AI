import "server-only";

/**
 * 轻量 PDF 文本抽取器 —— 无第三方依赖。
 * 通过 zlib inflate 解压 FlateDecode 流，抽取 Tj / TJ 文本操作符里的文字。
 * 仅用于保险合同等文本型 PDF 的关键字段提取（非通用排版还原）。
 */

import { inflateSync } from "node:zlib";

const MAX_STREAM_COUNT = 2_048;
const MAX_STREAM_OUTPUT_BYTES = 16 * 1024 * 1024;
const MAX_EXTRACTED_CHARS = 2 * 1024 * 1024;

type PdfLiteral = { raw: string; end: number };
type PdfArray = { literals: string[]; end: number };

/** 从 PDF buffer 抽取纯文本 */
export function extractPdfText(buf: Buffer): { text: string; warnings: string[] } {
  const warnings: string[] = [];
  const chunks: string[] = [];
  const source = buf.toString("latin1");
  let cursor = 0;
  let streamCount = 0;
  let extractedChars = 0;

  // 使用 indexOf 单向扫描内容流，避免对不受信 PDF 执行可回溯正则。
  while (cursor < source.length && streamCount < MAX_STREAM_COUNT) {
    const marker = source.indexOf("stream", cursor);
    if (marker === -1) break;
    let start = marker + "stream".length;
    if (source.startsWith("\r\n", start)) start += 2;
    else if (source[start] === "\n") start += 1;
    else {
      cursor = start;
      continue;
    }

    const endMarker = findEndStream(source, start);
    if (endMarker === -1) break;
    let end = endMarker;
    if (source[end - 1] === "\n") end -= 1;
    if (source[end - 1] === "\r") end -= 1;
    cursor = endMarker + "endstream".length;
    streamCount++;
    const raw = buf.subarray(start, end);

    if (raw.length > MAX_STREAM_OUTPUT_BYTES) {
      addWarning(warnings, "PDF 内容流超过安全解析上限，已跳过");
      continue;
    }

    let content = "";
    try {
      const inflated = inflateSync(raw, { maxOutputLength: MAX_STREAM_OUTPUT_BYTES });
      content = inflated.toString("latin1");
    } catch {
      // 未压缩或非 Flate 流，直接按原文尝试
      content = raw.toString("latin1");
    }

    const t = extractTextOps(content);
    if (t) {
      const remaining = MAX_EXTRACTED_CHARS - extractedChars;
      if (remaining <= 0) {
        addWarning(warnings, "PDF 文本超过安全解析上限，结果已截断");
        break;
      }
      const safeText = t.slice(0, remaining);
      chunks.push(safeText);
      extractedChars += safeText.length;
      if (safeText.length < t.length) {
        addWarning(warnings, "PDF 文本超过安全解析上限，结果已截断");
        break;
      }
    }
  }

  if (streamCount === MAX_STREAM_COUNT && cursor < source.length) {
    addWarning(warnings, "PDF 内容流数量超过安全解析上限，剩余内容已跳过");
  }

  if (streamCount === 0) {
    warnings.push("PDF 中未找到内容流");
  }

  const text = chunks.join("\n").replace(/[ \t]+/g, " ").trim();
  if (!text) {
    warnings.push("未能从 PDF 抽取到文本（可能为扫描件 / 图片型 PDF）");
  }
  return { text, warnings };
}

/** 从内容流中抽取 Tj / TJ 操作符的文本 */
function extractTextOps(content: string): string {
  const out: string[] = [];

  // PDF 字符串支持转义和嵌套括号；显式状态机可保证扫描时间与输入长度成正比。
  let cursor = 0;
  while (cursor < content.length) {
    if (content[cursor] === "(") {
      const literal = readPdfLiteral(content, cursor);
      if (!literal) {
        break;
      }
      const operatorAt = skipPdfWhitespace(content, literal.end);
      if (hasOperator(content, operatorAt, "Tj")) {
        out.push(decodePdfString(literal.raw));
      }
      cursor = literal.end;
      continue;
    }

    if (content[cursor] === "[") {
      const array = readPdfArray(content, cursor);
      if (!array) {
        break;
      }
      const operatorAt = skipPdfWhitespace(content, array.end);
      if (hasOperator(content, operatorAt, "TJ")) {
        out.push(array.literals.map(decodePdfString).join(""));
      }
      cursor = array.end;
      continue;
    }

    cursor += 1;
  }

  return out.join(" ");
}

function findEndStream(source: string, start: number): number {
  let cursor = source.indexOf("endstream", start);
  while (cursor !== -1) {
    if (cursor > start && (source[cursor - 1] === "\n" || source[cursor - 1] === "\r")) {
      return cursor;
    }
    cursor = source.indexOf("endstream", cursor + 1);
  }
  return -1;
}

function readPdfLiteral(source: string, start: number): PdfLiteral | null {
  let depth = 1;
  let cursor = start + 1;
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === "\\") {
      cursor += source[cursor + 1] === "\r" && source[cursor + 2] === "\n" ? 3 : 2;
      continue;
    }
    if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        const end = cursor + 1;
        return { raw: source.slice(start, end), end };
      }
    }
    cursor += 1;
  }
  return null;
}

function readPdfArray(source: string, start: number): PdfArray | null {
  const literals: string[] = [];
  let depth = 1;
  let cursor = start + 1;
  while (cursor < source.length) {
    if (source[cursor] === "(") {
      const literal = readPdfLiteral(source, cursor);
      if (!literal) return null;
      literals.push(literal.raw);
      cursor = literal.end;
      continue;
    }
    if (source[cursor] === "[") depth += 1;
    else if (source[cursor] === "]") {
      depth -= 1;
      if (depth === 0) return { literals, end: cursor + 1 };
    }
    cursor += 1;
  }
  return null;
}

function skipPdfWhitespace(source: string, start: number): number {
  let cursor = start;
  while (cursor < source.length) {
    const code = source.charCodeAt(cursor);
    if (code !== 0 && code !== 9 && code !== 10 && code !== 12 && code !== 13 && code !== 32) break;
    cursor += 1;
  }
  return cursor;
}

function hasOperator(source: string, start: number, operator: "Tj" | "TJ"): boolean {
  if (!source.startsWith(operator, start)) return false;
  const next = start + operator.length;
  if (next >= source.length) return true;
  const char = source[next];
  return skipPdfWhitespace(source, next) > next || "()<>[]{}/%".includes(char);
}

function addWarning(warnings: string[], warning: string): void {
  if (!warnings.includes(warning)) warnings.push(warning);
}

/** 解码 PDF 字符串字面量 (....)，处理转义 */
function decodePdfString(raw: string): string {
  // 去掉包裹的括号及 Tj/TJ
  const start = raw.indexOf("(");
  const end = raw.lastIndexOf(")");
  if (start === -1 || end === -1) return "";
  let s = raw.slice(start + 1, end);
  s = s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    // 八进制转义 \ddd
    .replace(/\\([0-7]{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));
  return s;
}
