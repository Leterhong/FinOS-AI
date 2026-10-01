import assert from "node:assert/strict";
import test from "node:test";

import { buildAnswerReferences } from "../../src/lib/answer-references";

test("从回答中提取事实与规则引用", () => {
  const refs = buildAnswerReferences("根据 [FACT-1] 与规则 R-CFO-001，经营现金流为负。", {
    documents: [{ id: "DOC-1", caseId: "CASE-1", factItems: [{ id: "FACT-1", caseId: "CASE-1", topic: "经营活动现金流量净额", quote: "经营活动现金流量净额 -420 万元" }] } as never],
    rules: [{ code: "R-CFO-001", name: "经营活动现金流为负" } as never],
    external: { fx: { base: "USD" } },
  });
  const types = refs.map((ref) => ref.type);
  assert.ok(types.includes("fact"));
  assert.ok(types.includes("rule"));
  assert.ok(types.includes("external"));
  assert.ok(refs.every((ref) => ref.label && ref.href));
});

test("无引用时返回空", () => {
  assert.deepEqual(buildAnswerReferences("泛泛而谈", null), []);
});
