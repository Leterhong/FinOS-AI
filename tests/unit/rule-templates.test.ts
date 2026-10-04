import assert from "node:assert/strict";
import test from "node:test";

import { RULE_TEMPLATES, recommendedTemplates, ruleTemplateGroups } from "../../src/lib/rule-templates";
import { INDUSTRY_PROFILES, matchIndustryProfile } from "../../src/lib/industry-thresholds";
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

test("规则模板数量扩充且每条都带详细说明", () => {
  assert.ok(RULE_TEMPLATES.length >= 50, `模板数量应扩充到 50 条以上，实际 ${RULE_TEMPLATES.length}`);
  for (const item of RULE_TEMPLATES) {
    for (const field of ["description", "basis", "impact", "suggestion"] as const) {
      assert.ok(item[field] && item[field].length >= 4, `${item.code} 缺少详细字段 ${field}`);
    }
  }
});

test("行业阈值分组覆盖主要行业", () => {
  const ids = INDUSTRY_PROFILES.map((profile) => profile.id);
  for (const id of ["general", "manufacturing", "trading", "realestate", "construction", "software", "pharma", "logistics", "agriculture"]) {
    assert.ok(ids.includes(id), `缺少行业分组 ${id}`);
  }
});

test("模板指标可被口径归一化", () => {
  for (const item of RULE_TEMPLATES) {
    assert.ok(canonicalMetricName(item.metric).length > 0);
  }
});

test("按企业所属行业匹配分组并推荐模板", () => {
  assert.equal(matchIndustryProfile("制造业").id, "manufacturing");
  assert.equal(matchIndustryProfile("房地产开发").id, "realestate");
  assert.equal(matchIndustryProfile("商贸零售").id, "trading");
  assert.equal(matchIndustryProfile("建筑工程").id, "construction");
  assert.equal(matchIndustryProfile("软件与信息服务").id, "software");
  assert.equal(matchIndustryProfile("医药制造").id, "pharma");
  assert.equal(matchIndustryProfile("物流运输").id, "logistics");
  assert.equal(matchIndustryProfile("农业养殖").id, "agriculture");
  assert.equal(matchIndustryProfile("").id, "general");
  const rec = recommendedTemplates("制造业");
  assert.equal(rec.profile.id, "manufacturing");
  assert.ok(rec.templates.length > 0);
  assert.ok(rec.templates.every((item) => item.industry === "manufacturing"));
  const general = recommendedTemplates("未知行业XYZ");
  assert.equal(general.profile.id, "general");
  assert.ok(general.templates.every((item) => item.industry === "general"));
});
