import assert from "node:assert/strict";
import test from "node:test";

import { scoreExtraction } from "../../src/lib/ai-eval-score";

test("完全正确时 P/R/F1 为 1，单位与引用均正确", () => {
  const cases = [{ id: "a", text: "营业收入 100 万元。", expected: [{ topic: "营业收入", value: 100, unit: "万元" }] }];
  const predictions = [{ id: "a", facts: [{ topic: "营业总收入", value: 100, unit: "万元", quote: "营业收入 100 万元" }] }];
  const metrics = scoreExtraction(cases, predictions);
  assert.equal(metrics.precision, 1);
  assert.equal(metrics.recall, 1);
  assert.equal(metrics.f1, 1);
  assert.equal(metrics.unitCorrectRate, 1);
  assert.equal(metrics.citationValidRate, 1);
});

test("漏抽与误抽分别计入 FN / FP", () => {
  const cases = [{ id: "a", text: "净利润 50 万元。", expected: [
    { topic: "净利润", value: 50, unit: "万元" },
    { topic: "营业收入", value: 100, unit: "万元" },
  ] }];
  const predictions = [{ id: "a", facts: [
    { topic: "净利润", value: 50, unit: "万元", quote: "净利润 50 万元" },
    { topic: "毛利率", value: 20, unit: "%", quote: "毛利率 20%" },
  ] }];
  const metrics = scoreExtraction(cases, predictions);
  assert.equal(metrics.truePositive, 1);
  assert.equal(metrics.falseNegative, 1);
  assert.equal(metrics.falsePositive, 1);
  assert.equal(metrics.precision, 0.5);
  assert.equal(metrics.recall, 0.5);
});

test("引用无法在原文定位时引用有效性为 0", () => {
  const cases = [{ id: "a", text: "营业收入 100 万元。", expected: [{ topic: "营业收入", value: 100, unit: "万元" }] }];
  const predictions = [{ id: "a", facts: [{ topic: "营业收入", value: 100, unit: "万元", quote: "编造的引用内容" }] }];
  assert.equal(scoreExtraction(cases, predictions).citationValidRate, 0);
});

test("空预测全部计为漏抽", () => {
  const cases = [{ id: "a", text: "货币资金 10 万元。", expected: [{ topic: "货币资金", value: 10, unit: "万元" }] }];
  const metrics = scoreExtraction(cases, [{ id: "a", facts: [] }]);
  assert.equal(metrics.recall, 0);
  assert.equal(metrics.falseNegative, 1);
});
