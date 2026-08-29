import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateRule, type RuleCondition, type FactCandidate } from "../../src/lib/rule-engine";

const fact = (value: number, unit: FactCandidate["unit"] = "元"): FactCandidate => ({
  topic: "货币资金",
  value,
  unit,
  quote: "货币资金 100 万元",
});

test("gt/gte/lt/lte/eq 按归一化金额比较", () => {
  const cond: RuleCondition = { metric: "货币资金", op: "lt", value: 2_000_000 };
  assert.equal(evaluateRule([fact(1_000_000)], cond).hit, true);
  assert.equal(evaluateRule([fact(3_000_000)], cond).hit, false);
});

test("万/亿 单位自动归一化到元", () => {
  const cond: RuleCondition = { metric: "货币资金", op: "gte", value: 5_000_000 };
  assert.equal(evaluateRule([fact(600, "万元")], cond).hit, true);
  assert.equal(evaluateRule([fact(0.6, "亿元")], cond).hit, true);
});

test("没有匹配事实时不命中且不编造", () => {
  const cond: RuleCondition = { metric: "资产负债率", op: "gt", value: 70 };
  const outcome = evaluateRule([fact(100)], cond);
  assert.equal(outcome.hit, false);
  assert.equal(outcome.reason.includes("未找到"), true);
});

test("任意事实满足即命中（hitAny 语义）", () => {
  const cond: RuleCondition = { metric: "货币资金", op: "lt", value: 500_000 };
  const outcome = evaluateRule([fact(3_000_000), fact(200_000)], cond);
  assert.equal(outcome.hit, true);
  assert.equal(outcome.matchedQuote, "货币资金 100 万元");
});
