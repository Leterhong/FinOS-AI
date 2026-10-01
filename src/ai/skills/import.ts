import "server-only";

/**
 * 技能文件导入解析（支持 .md/.markdown/.txt/.json 单文件与 .zip 压缩包）。
 * 从 SKILL.md / README.md / skill.json 中提取名称、说明、触发词与方法论文本。
 */
import { unzip } from "@/financial-data/parsers/zip";

const MAX_ZIP_ENTRIES = 200;
const MAX_ZIP_TOTAL_BYTES = 5 * 1024 * 1024;
const MAX_PLAYBOOK_CHARS = 8000;

export interface ParsedSkill {
  candidate: {
    name: string;
    summary: string;
    category: string;
    triggers: string[];
    modes: string[];
    playbook: string;
  };
  files: string[];
  sourceFile: string;
  /** 用于风险扫描的完整文本。 */
  text: string;
}

function decode(buffer: Buffer): string {
  const text = buffer.toString("utf8");
  if (text.includes("\u0000")) throw new Error("文件看起来是二进制内容，无法作为技能文本解析");
  return text;
}

function parseFrontmatter(text: string): { meta: Record<string, string>; body: string } {
  if (!text.startsWith("---")) return { meta: {}, body: text };
  const end = text.indexOf("\n---", 3);
  if (end === -1) return { meta: {}, body: text };
  const raw = text.slice(3, end).trim();
  const body = text.slice(end + 4).replace(/^\n+/, "");
  const meta: Record<string, string> = {};
  const lines = raw.split("\n");
  let currentKey = "";
  for (const line of lines) {
    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (match) {
      currentKey = match[1].toLowerCase();
      let value = match[2].trim();
      if (value === ">" || value === "|" || value === "") value = "";
      meta[currentKey] = value.replace(/^["']|["']$/g, "");
    } else if (currentKey && line.trim()) {
      meta[currentKey] = `${meta[currentKey]} ${line.trim()}`.trim();
    }
  }
  return { meta, body };
}

function pickTextFile(entries: Map<string, Buffer>): { name: string; text: string } | null {
  const names = [...entries.keys()];
  const prefer = [
    (n: string) => n.toLowerCase().endsWith("skill.md"),
    (n: string) => n.toLowerCase().endsWith("readme.md"),
    (n: string) => n.toLowerCase().endsWith(".md"),
    (n: string) => n.toLowerCase().endsWith(".txt"),
    (n: string) => n.toLowerCase().endsWith(".json"),
  ];
  for (const test of prefer) {
    const found = names.filter(test).sort((a, b) => a.split("/").length - b.split("/").length)[0];
    if (found) return { name: found, text: decode(entries.get(found)!) };
  }
  return null;
}

function deriveTriggers(meta: Record<string, string>, text: string): string[] {
  const raw = meta.triggers ?? meta.keywords ?? "";
  const list = raw ? raw.split(/[，,\s]+/).map((t) => t.trim()).filter(Boolean) : [];
  if (list.length) return [...new Set(list)].slice(0, 50);
  const cn = text.match(/触发(?:词|语|关键词)[：:]\s*([^\n]{2,120})/);
  if (cn) return [...new Set(cn[1].split(/[，,、\s]+/).map((t) => t.trim()).filter(Boolean))].slice(0, 50);
  return [];
}

function buildCandidate(fileName: string, text: string): ParsedSkill["candidate"] {
  const { meta, body } = parseFrontmatter(text);
  const heading = body.match(/^\s*#\s+(.+)$/m)?.[1]?.trim();
  const name = (meta.name || heading || fileName.replace(/\.(md|markdown|txt|json)$/i, "")).slice(0, 60);
  const summary = (meta.description || "").split("\n")[0].trim().slice(0, 200)
    || body.split("\n").map((l) => l.replace(/[#>*`-]/g, "").trim()).find((l) => l.length > 8)?.slice(0, 200)
    || "";
  return {
    name: name || "导入技能",
    summary,
    category: (meta.category ?? "导入技能").slice(0, 40),
    triggers: deriveTriggers(meta, text),
    modes: ["chat", "agent", "research"],
    playbook: body.trim().slice(0, MAX_PLAYBOOK_CHARS) || text.trim().slice(0, MAX_PLAYBOOK_CHARS),
  };
}

export function parseSkillFile(fileName: string, buffer: Buffer): ParsedSkill {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".zip")) {
    const entries = unzip(buffer);
    if (entries.size === 0) throw new Error("压缩包内没有可读取的文件");
    if (entries.size > MAX_ZIP_ENTRIES) throw new Error("压缩包内文件过多，已拒绝");
    let total = 0;
    for (const data of entries.values()) {
      total += data.length;
      if (total > MAX_ZIP_TOTAL_BYTES) throw new Error("压缩包解压后体积过大，已拒绝");
    }
    const picked = pickTextFile(entries);
    if (!picked) throw new Error("压缩包内未找到 SKILL.md / README.md / .md / .txt / .json 技能文件");
    return {
      candidate: buildCandidate(picked.name, picked.text),
      files: [...entries.keys()].slice(0, 100),
      sourceFile: fileName,
      text: picked.text,
    };
  }
  const text = decode(buffer);
  return { candidate: buildCandidate(fileName, text), files: [fileName], sourceFile: fileName, text };
}
