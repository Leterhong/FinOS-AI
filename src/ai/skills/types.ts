/**
 * 专属技能（Domain Skill）定义。
 *
 * 技能 = 触发词 + 领域 playbook + 输出契约 + 护栏。网关按 mode/问题选择技能，
 * 拼接到系统提示词，并把「本次使用的技能」返回给前端展示。
 *
 * 设计原则：薄提示 + 强结构 + 复用确定性引擎（规则/口径），避免堆砌泛化描述。
 */

export interface SkillContext {
  mode: "chat" | "agent" | "research";
  question: string;
}

export interface DomainSkill {
  id: string;
  name: string;
  /** 一句话说明，用于 UI 展示。 */
  summary: string;
  /** 触发关键词（命中即计分）。 */
  triggers: string[];
  /** 系统提示词追加片段（检查清单 / 输出契约 / 口径与护栏）。 */
  playbook: string;
  /** 选择权重：mode 强关联的技能优先。 */
  modes: Array<SkillContext["mode"]>;
}

/** 关键词命中计分并选取得分最高的技能；平局取第一个。 */
export function scoreSkill(skill: DomainSkill, context: SkillContext): number {
  let score = skill.modes.includes(context.mode) ? 1 : 0;
  const text = context.question.toLowerCase();
  for (const trigger of skill.triggers) {
    if (text.includes(trigger.toLowerCase())) score += 1;
  }
  return score;
}
