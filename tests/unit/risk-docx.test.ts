import assert from "node:assert/strict";
import test from "node:test";

import { Packer } from "docx";

import { buildRiskDocument } from "../../src/lib/risk-report-docx";
import type { RiskSignal } from "../../src/types/enterprise";

const risk: RiskSignal = {
  id: "RISK-1",
  caseId: "CASE-1",
  company: "测试企业",
  title: "经营现金流为负",
  level: "high",
  evidence: "经营活动现金流量净额 -420 万元",
  rule: "R-CFO-001",
  impact: "短期偿债压力上升",
  status: "待核验",
  origin: "AI线索",
  factIds: ["FACT-1"],
  ruleCodes: ["R-CFO-001"],
};

test("风险清单 Word 文档可生成", async () => {
  const doc = buildRiskDocument([risk], { generatedAt: "2026-10-01 12:00", project: "测试企业 · 尽调" });
  const buffer = await Packer.toBuffer(doc);
  assert.ok(buffer.length > 1000, "docx 产物应有合理大小");
});
