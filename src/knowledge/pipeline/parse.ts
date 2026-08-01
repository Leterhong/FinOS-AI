/**
 * 文档解析器（Phase 6.6，用户需求三）。
 *
 * 支持格式：
 *   - txt / markdown：原生解析（MD 去标记语法保留正文）；
 *   - pdf：可选依赖 `pdf-parse`（未安装时给出明确错误，不影响其他格式）；
 *   - docx：可选依赖 `mammoth`（同上）。
 *
 * 输入统一为 Buffer / string，输出纯文本，交给 chunk 层切片。
 */
import "server-only";

import type { DocumentFormat } from "../types";

/** Markdown → 纯文本：去掉标记符号，保留标题与正文语义。 */
export function markdownToText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, (block) =>
      block.replace(/```[^\n]*\n?/g, "").trim()
    ) // 代码块去围栏留内容
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // 图片 → alt 文本
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // 链接 → 锚文本
    .replace(/^#{1,6}\s+/gm, "") // 标题符号
    .replace(/^\s*[-*+]\s+/gm, "") // 无序列表符号
    .replace(/^\s*\d+\.\s+/gm, "") // 有序列表符号
    .replace(/^\s*>\s?/gm, "") // 引用符号
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, "$1$2") // 粗体
    .replace(/\*([^*]+)\*|_([^_]+)_/g, "$1$2") // 斜体
    .replace(/~~([^~]+)~~/g, "$1") // 删除线
    .replace(/`([^`]+)`/g, "$1") // 行内代码
    .replace(/^\s*\|.*\|\s*$/gm, (row) =>
      row.replace(/\|/g, " ").replace(/-{3,}/g, "").trim()
    ) // 表格行
    .replace(/^[-=*_]{3,}\s*$/gm, "") // 分割线
    .trim();
}

/** 根据文件名推断格式（上传场景）。 */
export function inferFormat(fileName: string): DocumentFormat | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return "pdf";
  if (ext === "docx" || ext === "doc") return "docx";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "txt" || ext === "text") return "txt";
  return null;
}

/**
 * 主入口：按格式解析为纯文本。
 * PDF / Word 依赖未安装时抛出带指引的错误（由摄取管线捕获写入 doc.error）。
 */
export async function parseDocument(
  format: DocumentFormat,
  data: Buffer | string
): Promise<string> {
  switch (format) {
    case "txt":
      return (typeof data === "string" ? data : data.toString("utf8")).trim();

    case "markdown":
      return markdownToText(
        typeof data === "string" ? data : data.toString("utf8")
      );

    case "pdf": {
      const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
      try {
        // 可选依赖：npm install pdf-parse
        const mod = (await import("pdf-parse" as string)) as unknown as {
          default?: (b: Buffer) => Promise<{ text: string }>;
        };
        const pdfParse =
          mod.default ?? (mod as unknown as (b: Buffer) => Promise<{ text: string }>);
        const result = await pdfParse(buf);
        return result.text.trim();
      } catch (err) {
        if (isModuleNotFound(err)) {
          throw new Error(
            "PDF 解析依赖未安装：请执行 `npm install pdf-parse` 后重试；或将内容转为 TXT/Markdown 上传"
          );
        }
        throw err;
      }
    }

    case "docx": {
      const buf = typeof data === "string" ? Buffer.from(data, "utf8") : data;
      try {
        // 可选依赖：npm install mammoth
        const mammoth = (await import("mammoth" as string)) as unknown as {
          extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string }>;
        };
        const result = await mammoth.extractRawText({ buffer: buf });
        return result.value.trim();
      } catch (err) {
        if (isModuleNotFound(err)) {
          throw new Error(
            "Word 解析依赖未安装：请执行 `npm install mammoth` 后重试；或将内容转为 TXT/Markdown 上传"
          );
        }
        throw err;
      }
    }
  }
}

function isModuleNotFound(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("Cannot find module") ||
    msg.includes("MODULE_NOT_FOUND") ||
    msg.includes("Failed to resolve")
  );
}
