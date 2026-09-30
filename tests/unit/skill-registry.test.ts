import assert from "node:assert/strict";
import test from "node:test";

import { listSkills, selectSkill } from "../../src/ai/skills/registry";
import type { DomainSkill } from "../../src/ai/skills/types";

test("Agent 模式命中企业授信尽调技能", () => {
  const skill = selectSkill({ mode: "agent", question: "帮我研判这家企业的风险" });
  assert.equal(skill?.id, "enterprise-credit");
});

test("chat 模式仅关键词命中时启用专属技能", () => {
  assert.equal(selectSkill({ mode: "chat", question: "今天天气怎么样" }), null);
  const skill = selectSkill({ mode: "chat", question: "这家公司经营现金流为负、客户集中度很高，风险如何" });
  assert.equal(skill?.id, "enterprise-credit");
});

test("审计类问题命中企业文档智能审计技能", () => {
  const skill = selectSkill({ mode: "chat", question: "帮我审计这套采购材料，合同和报价单对不对得上" });
  assert.equal(skill?.id, "enterprise-document-audit");
});

test("仅在选择已启用技能时挑选", () => {
  assert.equal(selectSkill({ mode: "agent", question: "尽调" }, ["enterprise-document-audit"])?.id, "enterprise-document-audit");
  assert.equal(selectSkill({ mode: "agent", question: "尽调" }, []), null);
});

test("用户自定义技能可被匹配与指定", () => {
  const custom: DomainSkill = {
    id: "custom-1",
    name: "供应商合规审查",
    summary: "自定义",
    triggers: ["供应商", "资质"],
    modes: ["chat", "agent", "research"],
    playbook: "按合规清单输出",
    custom: true,
  };
  assert.equal(selectSkill({ mode: "chat", question: "帮我审查供应商资质" }, ["custom-1"], [custom])?.id, "custom-1");
  assert.equal(selectSkill({ mode: "agent", question: "随便" }, ["custom-1"], [custom])?.id, "custom-1");
});

test("技能注册表包含 playbook 与输出契约", () => {
  const list = listSkills();
  assert.ok(list.some((item) => item.id === "enterprise-credit"));
  assert.ok(list.some((item) => item.id === "enterprise-document-audit"));
  const skill = selectSkill({ mode: "agent", question: "尽调" });
  assert.match(skill?.playbook ?? "", /人工复核清单/);
  assert.match(skill?.playbook ?? "", /口径/);
});
