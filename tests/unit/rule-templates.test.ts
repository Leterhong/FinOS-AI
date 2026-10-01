import assert from "node:assert/strict";
import test from "node:test";

import { RULE_TEMPLATES, ruleTemplateGroups } from "../../src/lib/rule-templates";
import { INDUSTRY_PROFILES } from "../../src/lib/industry-thresholds";
import { canonicalMetricName } from "../../src/lib/metric-aliases";

test("规则模板库非空且编号唯一", () => {
  assert.ok(RULE_TEMPLATES.length >= 10);
  const codes = RULE_TEMPLATES.map((item) => item.code);
  assert.equal(new Set(codes).size, codes.length, "模板编号必须唯一");
  for (const item of RULE_TEMPLATES) {
    assert.ok(item.metric && item.name && Number.isFinite(item.value));
  }
  assert.ok(ruleTemplateGroups().includes("通用"));
});

test("行业阈值分组覆盖主要行业", () => {
  const ids = INDUSTRY_PROFILES.map((profile) => profile.id);
  for (const id of ["general", "manufacturing", "trading", "realestate", "construction"]) {
    assert.ok(ids.includes(id), `缺少行业分组 ${id}`);
  }
});

test("模板指标可被口径归一化", () => {
  for (const item of RULE_TEMPLATES) {
    assert.ok(canonicalMetricName(item.metric).length > 0);
  }
});
