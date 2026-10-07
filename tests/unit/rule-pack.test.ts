import assert from "node:assert/strict";
import test from "node:test";

import { buildRulePack, parseRulePack, serializeRulePack } from "../../src/lib/rule-pack";

test("导出后再导入应保持规则一致", () => {
  const pack = buildRulePack(
    [{ code: "CR-001", name: "现金流为负", domain: "现金流", conditions: [{ metric: "经营现金流", op: "lt", value: 0 }], industries: ["制造业"] }],
    "2026-01-01T00:00:00.000Z",
  );
  const result = parseRulePack(serializeRulePack(pack));
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.rules.length, 1);
  assert.equal(result.ok && result.rules[0].code, "CR-001");
  assert.deepEqual(result.ok && result.rules[0].conditions, [{ metric: "经营现金流", op: "lt", value: 0 }]);
});

test("拒绝非 JSON 与缺少 rules", () => {
  assert.equal(parseRulePack("not json").ok, false);
  assert.equal(parseRulePack("[]").ok, false);
  assert.equal(parseRulePack("{}").ok, false);
});

test("缺少必填字段或条件非法时返回错误", () => {
  const missing = parseRulePack(JSON.stringify({ rules: [{ code: "A", name: "" }] }));
  assert.equal(missing.ok, false);
  const badOp = parseRulePack(JSON.stringify({ rules: [{ code: "A", name: "n", domain: "d", conditions: [{ metric: "m", op: "??", value: 1 }] }] }));
  assert.equal(badOp.ok, false);
  const badValue = parseRulePack(JSON.stringify({ rules: [{ code: "A", name: "n", domain: "d", conditions: [{ metric: "m", op: "gt", value: "x" }] }] }));
  assert.equal(badValue.ok, false);
});

test("包内重复编号自动去重，空包被拒绝", () => {
  const dup = parseRulePack(JSON.stringify({ rules: [
    { code: "A", name: "n1", domain: "d" },
    { code: "A", name: "n2", domain: "d" },
  ] }));
  assert.equal(dup.ok, true);
  assert.equal(dup.ok && dup.rules.length, 1);
});

test("超出规则数量上限被拒绝", () => {
  const rules = Array.from({ length: 501 }, (_, i) => ({ code: `R${i}`, name: "n", domain: "d" }));
  const result = parseRulePack(JSON.stringify({ rules }));
  assert.equal(result.ok, false);
});
