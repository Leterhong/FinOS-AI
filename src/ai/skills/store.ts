import "server-only";

/**
 * 专属技能启用状态存储（按工作区/账号隔离，服务端 JSON 文件）。
 * 默认全部启用；仅记录被禁用的技能 id，便于后续新增技能自动生效。
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { skillIds } from "./registry";

const DATA_DIR = path.join(process.cwd(), ".data", "skills");

function filePath(userId: string): string {
  const safe = userId.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 120) || "anon";
  return path.join(DATA_DIR, `${safe}.json`);
}

function knownOnly(ids: unknown): string[] {
  if (!Array.isArray(ids)) return [];
  const known = new Set(skillIds());
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && known.has(id)))];
}

export async function getDisabledSkills(userId: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(filePath(userId), "utf8");
    const parsed = JSON.parse(raw) as { disabled?: unknown };
    return knownOnly(parsed.disabled);
  } catch {
    return [];
  }
}

export async function setDisabledSkills(userId: string, disabled: unknown): Promise<string[]> {
  const next = knownOnly(disabled);
  await fs.mkdir(DATA_DIR, { recursive: true });
  const target = filePath(userId);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ disabled: next }), "utf8");
  await fs.rename(tmp, target);
  return next;
}

/** 当前工作区启用中的技能 id。 */
export async function getEnabledSkillIds(userId: string): Promise<string[]> {
  const disabled = await getDisabledSkills(userId);
  return skillIds().filter((id) => !disabled.includes(id));
}
