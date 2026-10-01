import assert from "node:assert/strict";
import test from "node:test";

import { Packer } from "docx";

import { buildRiskDocument } from "../../src/lib/risk-report-docx";
import { buildRiskMarkdown } from "../../src/lib/risk-report-md";
import { buildExportGroups, highlightSegments } from "../../src/lib/risk-export";
import type { ExportContext } from "../../src/lib/risk-export";
import type { RiskSignal } from "../../src/types/enterprise";

const risk: RiskSignal = {
  id: "RISK-1",
  caseId: "CASE-1",
  company: "测试企业",
  title: "经营现金流为负",
  level: "high",
  evidence: "经营活动现金流量净额 -420 万元，需关注偿债压力",
  rule: "现金流量持续性审查要求",
  impact: "短期偿债压力上升",
  status: "待核验",
  origin: "AI线索",
  factIds: ["FACT-1"],
  ruleCodes: ["R-CFO-001"],
};

const context: ExportContext = {
  cases: [{ id: "CASE-1", company: "测试企业", title: "尽调", industry: "制造业", amount: "", owner: "", progress: 0, status: "研判中", risk: "medium", nextAction: "", updatedAt: "" }],
  rules: [{ id: "RULE-1", code: "R-CFO-001", name: "经营活动现金流为负", domain: "授信", version: "v1.0", coverage: "已测试", coverageRate: 100, updated: "" }],
  documents: [{ id: "DOC-1", caseId: "CASE-1", name: "审计报告.pdf", kind: "企业资料", pages: 1, status: "已解析", confidence: 1, facts: 1, ruleHits: 0, uploadedAt: "", factItems: [{ id: "FACT-1", documentId: "DOC-1", documentName: "审计报告.pdf", caseId: "CASE-1", topic: "经营活动产生的现金流量净额", value: -420, unit: "万元", quote: "经营活动现金流量净额 -420 万元", reviewStatus: "已确认" } as never] } as never],
};

test("风险清单 Word 文档可生成（含分组与证据高亮）", async () => {
  const groups = buildExportGroups([risk], context);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].project, "测试企业 · 尽调");
  const doc = buildRiskDocument(groups, { generatedAt: "2026-10-01 12:00", title: "企业风险清单" });
  const buffer = await Packer.toBuffer(doc);
  assert.ok(buffer.length > 1000, "docx 产物应有合理大小");
});

test("Markdown 导出包含项目分组、基础信息、财务指标、规则依据与高亮标记", () => {
  const md = buildRiskMarkdown([risk], context, "2026-10-01 12:00");
  assert.match(md, /## 项目：测试企业 · 尽调/);
  assert.match(md, /### 企业基础信息/);
  assert.match(md, /所属行业：制造业/);
  assert.match(md, /### 风险汇总/);
  assert.match(md, /### 财务指标/);
  assert.match(md, /高风险/);
  assert.match(md, /R-CFO-001@v1\.0/);
  assert.match(md, /==经营活动现金流量净额 -420 万元==/);
});

test("证据高亮按引用原文切分片段", () => {
  const segments = highlightSegments("经营活动现金流量净额 -420 万元，需关注偿债压力", ["经营活动现金流量净额 -420 万元"]);
  assert.equal(segments[0].mark, true);
  assert.equal(segments[0].text, "经营活动现金流量净额 -420 万元");
  assert.ok(segments.some((segment) => !segment.mark && segment.text.includes("需关注")));
});
