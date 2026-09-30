import { enterpriseCreditSkill } from "./enterprise-credit";
import { scoreSkill, type DomainSkill, type SkillContext } from "./types";

/** 已注册的专属技能（后续可继续追加领域技能）。 */
export const SKILLS: DomainSkill[] = [enterpriseCreditSkill];

/**
 * 按 mode + 问题关键词选择最合适的技能。
 * 返回 null 表示无技能命中（走通用助手提示）。
 */
export function selectSkill(context: SkillContext): DomainSkill | null {
  let best: DomainSkill | null = null;
  let bestScore = 0;
  for (const skill of SKILLS) {
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

export function listSkills(): Array<Pick<DomainSkill, "id" | "name" | "summary">> {
  return SKILLS.map((skill) => ({ id: skill.id, name: skill.name, summary: skill.summary }));
}
