import "server-only";

/**
 * 轻量 PDF 文本抽取器 —— 无第三方依赖。
 * 通过 zlib inflate 解压 FlateDecode 流，抽取 Tj / TJ 文本操作符里的文字。
 * 仅用于保险合同等文本型 PDF 的关键字段提取（非通用排版还原）。
 */

import { inflateSync } from "node:zlib";

/** 从 PDF buffer 抽取纯文本 */
export function extractPdfText(buf: Buffer): { text: string; warnings: string[] } {
  const warnings: string[] = [];
  const chunks: string[] = [];

  // 匹配所有 stream ... endstream 段
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;
  let streamCount = 0;

  while ((m = streamRegex.exec(buf.toString("latin1"))) !== null) {
    streamCount++;
    const start = m.index + m[0].indexOf(m[1]);
    const end = start + m[1].length;
    const raw = buf.subarray(start, end);

    let content = "";
    try {
      const inflated = inflateSync(raw);
      content = inflated.toString("latin1");
    } catch {
      // 未压缩或非 Flate 流，直接按原文尝试
      content = raw.toString("latin1");
    }

    const t = extractTextOps(content);
    if (t) chunks.push(t);
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

  // (string) Tj
  const tjRegex = /\((?:\\.|[^\\)])*\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = tjRegex.exec(content)) !== null) {
    out.push(decodePdfString(m[0]));
  }

  // [ (str) num (str) ... ] TJ
  const tjArrRegex = /\[((?:\\.|[^\]])*)\]\s*TJ/g;
  while ((m = tjArrRegex.exec(content)) !== null) {
    const inner = m[1];
    const strRegex = /\((?:\\.|[^\\)])*\)/g;
    let sm: RegExpExecArray | null;
    const parts: string[] = [];
    while ((sm = strRegex.exec(inner)) !== null) {
      parts.push(decodePdfString(sm[0]));
    }
    out.push(parts.join(""));
  }

  return out.join(" ");
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
