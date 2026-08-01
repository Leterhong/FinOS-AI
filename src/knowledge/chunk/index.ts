/**
 * 文本切片器（Phase 6.6）。
 *
 * 策略：
 *   1. 先按段落（空行）分组，尽量保持语义完整；
 *   2. 段落过长时按句边界（。！？!?.;；\n）二次切分；
 *   3. 目标片长 maxChars（默认 480 字符），相邻片保留 overlapChars（默认 60）重叠，
 *      避免关键信息被切断导致检索丢失。
 *
 * 纯函数、无 IO，可在任意环境单测。
 */

import type { ChunkOptions } from "../types";

const DEFAULT_MAX_CHARS = 480;
const DEFAULT_OVERLAP = 60;

/** 句边界正则：中英文句号 / 问叹号 / 分号 / 换行。 */
const SENTENCE_RE = /[^。！？!?.;；\n]+[。！？!?.;；\n]*/g;

/** 规范化文本：统一换行、去除多余空白。 */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 将长段落切成不超过 maxChars 的句子组。 */
function splitLongParagraph(paragraph: string, maxChars: number): string[] {
  const sentences = paragraph.match(SENTENCE_RE) ?? [paragraph];
  const parts: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if (buf.length + s.length > maxChars && buf.length > 0) {
      parts.push(buf.trim());
      buf = "";
    }
    // 单句超长（无标点长文本）：硬切
    if (s.length > maxChars) {
      for (let i = 0; i < s.length; i += maxChars) {
        const piece = s.slice(i, i + maxChars);
        if (piece.trim()) parts.push(piece.trim());
      }
      continue;
    }
    buf += s;
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

/**
 * 主入口：把整篇文本切成有序切片文本数组。
 * 返回值仅是文本片段；组装为 DocumentChunk 由摄取管线负责。
 */
export function chunkText(raw: string, options?: ChunkOptions): string[] {
  const maxChars = Math.max(80, options?.maxChars ?? DEFAULT_MAX_CHARS);
  const overlap = Math.min(
    Math.max(0, options?.overlapChars ?? DEFAULT_OVERLAP),
    Math.floor(maxChars / 2)
  );

  const text = normalizeText(raw);
  if (!text) return [];
  if (text.length <= maxChars) return [text];

  // 1) 段落分组
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  // 2) 段落 → 不超过 maxChars 的基础片
  const basePieces: string[] = [];
  let buf = "";
  for (const p of paragraphs) {
    const para = p.trim();
    if (para.length > maxChars) {
      if (buf) {
        basePieces.push(buf);
        buf = "";
      }
      basePieces.push(...splitLongParagraph(para, maxChars));
      continue;
    }
    if (buf.length + para.length + 1 > maxChars && buf) {
      basePieces.push(buf);
      buf = para;
    } else {
      buf = buf ? `${buf}\n${para}` : para;
    }
  }
  if (buf) basePieces.push(buf);

  // 3) 追加重叠：每片头部拼上前一片的尾部 overlap 字符
  if (overlap === 0) return basePieces;
  return basePieces.map((piece, i) => {
    if (i === 0) return piece;
    const prevTail = basePieces[i - 1].slice(-overlap);
    return `${prevTail}\n${piece}`;
  });
}
