import { enterpriseCreditSkill } from "./enterprise-credit";
import { enterpriseDocumentAuditSkill } from "./enterprise-document-audit";
import { scoreSkill, type DomainSkill, type SkillContext } from "./types";

/** 已注册的专属技能（后续可继续追加领域技能）。 */
export const SKILLS: DomainSkill[] = [enterpriseCreditSkill, enterpriseDocumentAuditSkill];

/**
 * 按 mode + 问题关键词选择最合适的技能。
 * @param enabledIds 仅在这些技能中挑选；不传则使用全部（内置 + 自定义）技能。
 * @param extra 用户自定义技能。
 * 返回 null 表示无技能命中（走通用助手提示）。
 */
export function selectSkill(context: SkillContext, enabledIds?: string[], extra: DomainSkill[] = []): DomainSkill | null {
  const all = [...SKILLS, ...extra];
  const pool = enabledIds ? all.filter((skill) => enabledIds.includes(skill.id)) : all;
  let best: DomainSkill | null = null;
  let bestScore = 0;
  for (const skill of pool) {
    const score = scoreSkill(skill, context);
    if (score > bestScore) {
      best = skill;
      bestScore = score;
    }
  }
  // chat 模式至少命中一个关键词才启用技能，避免无关闲聊被套上尽调模板。
  if (context.mode === "chat" && bestScore < 2) return null;
  return best;
}

export function listSkills(): DomainSkill[] {
  return SKILLS;
}

export function getSkill(id: string, extra: DomainSkill[] = []): DomainSkill | null {
  return [...SKILLS, ...extra].find((skill) => skill.id === id) ?? null;
}

export function skillIds(): string[] {
  return SKILLS.map((skill) => skill.id);
}
