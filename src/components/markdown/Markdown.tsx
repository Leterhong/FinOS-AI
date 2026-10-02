"use client";

/**
 * 轻量 Markdown 渲染器（无第三方依赖）。
 *
 * 支持模型输出常见的：标题（# / 中文序号「一、」）、有序/无序列表、
 * 加粗/斜体/行内代码、代码块、引用、分割线、表格、段落。
 * 目的：把研判输出渲染成结构化文档，而不是按行号堆叠的纯文本。
 */
import { Fragment, memo, type ReactNode } from "react";

function renderInline(text: string, key: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const keyId = `${key}-i${index++}`;
    if (token.startsWith("**")) {
      nodes.push(<strong key={keyId} className="font-semibold text-white">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(<code key={keyId} className="rounded bg-white/[0.08] px-1 py-0.5 font-mono text-[0.85em] text-cyan-200">{token.slice(1, -1)}</code>);
    } else {
      nodes.push(<em key={keyId} className="italic text-slate-200">{token.slice(1, -1)}</em>);
    }
    last = regex.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const ORDERED = /^\s*(\d+)[.)、]\s+(.*)$/;
const UNORDERED = /^\s*[-*+]\s+(.*)$/;
const CN_HEADING = /^\s*([一二三四五六七八九十]+)[、.．]\s*(.+)$/;
const MD_HEADING = /^(#{1,6})\s+(.*)$/;
const HR = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE = /^\s*>\s?(.*)$/;

function isTableSeparator(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && line.includes("-");
}

function splitRow(line: string): string[] {
  return line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((cell) => cell.trim());
}

function MarkdownImpl({ content, className }: { content: string; className?: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i += 1; continue; }

    // 代码块
    if (line.trim().startsWith("```")) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) { body.push(lines[i]); i += 1; }
      i += 1;
      blocks.push(
        <pre key={`k${key++}`} className="scrollbar-thin overflow-x-auto rounded-lg border border-white/[0.08] bg-black/30 p-3 text-[12px] leading-6 text-slate-200">
          <code className="font-mono">{body.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    if (HR.test(line)) { blocks.push(<hr key={`k${key++}`} className="border-white/[0.08]" />); i += 1; continue; }

    // 标题
    const md = line.match(MD_HEADING);
    if (md) {
      const level = md[1].length;
      const sizes = ["text-lg", "text-base", "text-sm", "text-sm", "text-xs", "text-xs"];
      blocks.push(<p key={`k${key++}`} className={`mt-2 font-semibold text-white ${sizes[level - 1]}`}>{renderInline(md[2], `h${key}`)}</p>);
      i += 1; continue;
    }
    const cn = line.match(CN_HEADING);
    if (cn && line.trim().length < 40) {
      blocks.push(<p key={`k${key++}`} className="mt-2 text-sm font-semibold text-white">{cn[1]}、{renderInline(cn[2], `ch${key}`)}</p>);
      i += 1; continue;
    }

    // 引用
    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) { body.push(lines[i].match(QUOTE)![1]); i += 1; }
      blocks.push(<blockquote key={`k${key++}`} className="border-l-2 border-cyan-400/30 pl-3 text-slate-400">{renderInline(body.join(" "), `q${key}`)}</blockquote>);
      continue;
    }

    // 表格
    if (line.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) { rows.push(splitRow(lines[i])); i += 1; }
      blocks.push(
        <div key={`k${key++}`} className="scrollbar-thin overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead><tr>{header.map((cell, ci) => <th key={ci} className="border-b border-white/10 px-3 py-2 font-medium text-cyan-200/80">{renderInline(cell, `th${key}-${ci}`)}</th>)}</tr></thead>
            <tbody>{rows.map((row, ri) => <tr key={ri} className="odd:bg-white/[0.02]">{header.map((_, ci) => <td key={ci} className="border-b border-white/[0.06] px-3 py-2 text-slate-300">{renderInline(row[ci] ?? "", `td${key}-${ri}-${ci}`)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }

    // 有序列表（使用原文编号渲染，避免列表被段落打断后每段都从 1 重新计数）
    if (ORDERED.test(line)) {
      const items: Array<{ marker: string; text: string }> = [];
      while (i < lines.length && ORDERED.test(lines[i])) {
        const m = lines[i].match(ORDERED)!;
        items.push({ marker: m[1], text: m[2] });
        i += 1;
      }
      blocks.push(
        <ul key={`k${key++}`} className="ml-1 list-none space-y-1.5 text-sm leading-7 text-slate-300">
          {items.map((item, ii) => (
            <li key={ii} className="flex gap-2">
              <span className="shrink-0 tabular-nums text-slate-500">{item.marker}.</span>
              <span className="min-w-0">{renderInline(item.text, `ol${key}-${ii}`)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // 无序列表
    if (UNORDERED.test(line)) {
      const items: string[] = [];
      while (i < lines.length && UNORDERED.test(lines[i])) { items.push(lines[i].match(UNORDERED)![1]); i += 1; }
      blocks.push(<ul key={`k${key++}`} className="ml-4 list-disc space-y-1 text-sm leading-7 text-slate-300">{items.map((item, ii) => <li key={ii} className="pl-1">{renderInline(item, `ul${key}-${ii}`)}</li>)}</ul>);
      continue;
    }

    // 段落（合并连续非空行）
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !ORDERED.test(lines[i]) && !UNORDERED.test(lines[i]) && !MD_HEADING.test(lines[i]) && !QUOTE.test(lines[i]) && !HR.test(lines[i]) && !lines[i].trim().startsWith("```")) {
      para.push(lines[i].trim());
      i += 1;
    }
    blocks.push(<p key={`k${key++}`} className="text-sm leading-7 text-slate-300">{renderInline(para.join(" "), `p${key}`)}</p>);
  }

  return <div className={className ?? "space-y-2.5"}>{blocks.map((block, bi) => <Fragment key={bi}>{block}</Fragment>)}</div>;
}

/** 记忆化：内容不变时不重复解析 Markdown（流式场景只重渲染当前气泡）。 */
export const Markdown = memo(MarkdownImpl);
