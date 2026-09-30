import assert from "node:assert/strict";
import test from "node:test";

import { listSkills, selectSkill } from "../../src/ai/skills/registry";

test("Agent 模式命中企业授信尽调技能", () => {
  const skill = selectSkill({ mode: "agent", question: "帮我研判这家企业的风险" });
  assert.equal(skill?.id, "enterprise-credit");
});

test("chat 模式仅关键词命中时启用专属技能", () => {
  assert.equal(selectSkill({ mode: "chat", question: "今天天气怎么样" }), null);
  const skill = selectSkill({ mode: "chat", question: "这家公司经营现金流为负、客户集中度很高，风险如何" });
  assert.equal(skill?.id, "enterprise-credit");
});

test("技能注册表包含 playbook 与输出契约", () => {
  const list = listSkills();
  assert.ok(list.some((item) => item.id === "enterprise-credit"));
  const skill = selectSkill({ mode: "agent", question: "尽调" });
  assert.match(skill?.playbook ?? "", /人工复核清单/);
  assert.match(skill?.playbook ?? "", /口径/);
});
