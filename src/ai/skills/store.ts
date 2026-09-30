import "server-only";

/**
 * 专属技能配置存储（按工作区/账号隔离，服务端 JSON 文件）。
 *  - disabled：被停用的技能 id（内置 + 自定义）；
 *  - custom：用户自建的技能（可添加/删除）。
 * 默认全部启用；仅记录被停用的技能，便于新增技能自动生效。
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { skillIds } from "./registry";
import type { DomainSkill } from "./types";

const DATA_DIR = path.join(process.cwd(), ".data", "skills");
const MODES = new Set(["chat", "agent", "research"]);

interface SkillsConfig {
  disabled: string[];
  custom: DomainSkill[];
}

function filePath(userId: string): string {
  const safe = userId.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 120) || "anon";
  return path.join(DATA_DIR, `${safe}.json`);
}

function sanitizeSkill(raw: unknown): DomainSkill | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const id = typeof item.id === "string" ? item.id : "";
  const name = typeof item.name === "string" ? item.name.trim() : "";
  const playbook = typeof item.playbook === "string" ? item.playbook : "";
  if (!id || !name || !playbook) return null;
  const triggers = Array.isArray(item.triggers)
    ? item.triggers.filter((t): t is string => typeof t === "string" && t.trim().length > 0).slice(0, 50)
    : [];
  const modes = Array.isArray(item.modes)
    ? item.modes.filter((m): m is DomainSkill["modes"][number] => typeof m === "string" && MODES.has(m))
    : [];
  return {
    id,
    name,
    summary: typeof item.summary === "string" ? item.summary : "",
    category: typeof item.category === "string" && item.category ? item.category : "自定义",
    source: typeof item.source === "string" && item.source ? item.source : "用户自定义",
    version: typeof item.version === "string" && item.version ? item.version : "1.0.0",
    triggers,
    modes: modes.length ? modes : ["chat", "agent", "research"],
    playbook,
    custom: true,
  };
}

async function readConfig(userId: string): Promise<SkillsConfig> {
  try {
    const raw = await fs.readFile(filePath(userId), "utf8");
    const parsed = JSON.parse(raw) as { disabled?: unknown; custom?: unknown };
    const custom = Array.isArray(parsed.custom)
      ? parsed.custom.map(sanitizeSkill).filter((item): item is DomainSkill => item !== null)
      : [];
    return { disabled: Array.isArray(parsed.disabled) ? parsed.disabled.filter((x): x is string => typeof x === "string") : [], custom };
  } catch {
    return { disabled: [], custom: [] };
  }
}

async function writeConfig(userId: string, config: SkillsConfig): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const target = filePath(userId);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(config), "utf8");
  await fs.rename(tmp, target);
}

function allKnownIds(config: SkillsConfig): Set<string> {
  return new Set([...skillIds(), ...config.custom.map((skill) => skill.id)]);
}

export async function getCustomSkills(userId: string): Promise<DomainSkill[]> {
  return (await readConfig(userId)).custom;
}

export async function getDisabledSkills(userId: string): Promise<string[]> {
  const config = await readConfig(userId);
  const known = allKnownIds(config);
  return [...new Set(config.disabled.filter((id) => known.has(id)))];
}

export async function setDisabledSkills(userId: string, disabled: unknown): Promise<string[]> {
  const config = await readConfig(userId);
  const known = allKnownIds(config);
  const next = Array.isArray(disabled)
    ? [...new Set(disabled.filter((id): id is string => typeof id === "string" && known.has(id)))]
    : [];
  await writeConfig(userId, { ...config, disabled: next });
  return next;
}

export interface CustomSkillInput {
  name: string;
  summary?: string;
  category?: string;
  triggers?: string[];
  modes?: string[];
  playbook: string;
}

function randomId(): string {
  return `custom-${(globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/-/g, "").slice(0, 12)}`;
}

export async function addCustomSkill(userId: string, input: CustomSkillInput): Promise<DomainSkill> {
  const config = await readConfig(userId);
  const skill: DomainSkill = {
    id: randomId(),
    name: input.name.trim().slice(0, 60),
    summary: (input.summary ?? "").trim().slice(0, 200),
    category: (input.category ?? "").trim().slice(0, 40) || "自定义",
    source: "用户自定义",
    version: "1.0.0",
    triggers: (input.triggers ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 50),
    modes: (input.modes ?? []).filter((m): m is DomainSkill["modes"][number] => MODES.has(m)).slice(0, 3),
    playbook: input.playbook.slice(0, 8000),
    custom: true,
  };
  if (!skill.modes.length) skill.modes = ["chat", "agent", "research"];
  await writeConfig(userId, { ...config, custom: [...config.custom, skill] });
  return skill;
}

export async function removeCustomSkill(userId: string, id: string): Promise<boolean> {
  const config = await readConfig(userId);
  const next = config.custom.filter((skill) => skill.id !== id);
  if (next.length === config.custom.length) return false;
  await writeConfig(userId, { disabled: config.disabled.filter((item) => item !== id), custom: next });
  return true;
}

/** 当前工作区启用中的技能 id（内置 + 自定义，去掉被停用的）。 */
export async function getEnabledSkillIds(userId: string): Promise<string[]> {
  const config = await readConfig(userId);
  const all = [...skillIds(), ...config.custom.map((skill) => skill.id)];
  return all.filter((id) => !config.disabled.includes(id));
}
