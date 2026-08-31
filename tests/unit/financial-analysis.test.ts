import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateFinancialMetrics, calculateFinancialTrends } from "../../src/lib/financial-analysis";
import { buildEnterpriseReport } from "../../src/lib/enterprise-report";
import type { EvidenceFact } from "../../src/types/enterprise";

function fact(id: string, topic: string, value: number, unit = "万元", period = "2025"): EvidenceFact {
  return {
    id,
    documentId: "DOC-1",
    documentName: "2025审计报告.pdf",
    caseId: "CASE-1",
    topic,
    value,
    unit,
    quote: `${topic} ${value}${unit}`,
    location: "第 8 页",
    period,
    confidence: 0.95,
    reviewStatus: "已确认",
  };
}

test("只基于真实且未驳回的事实计算财务指标", () => {
  const facts = [
    fact("F-1", "流动资产", 600),
    fact("F-2", "流动负债", 300),
    fact("F-3", "资产总计", 2000),
    fact("F-4", "负债合计", 1200),
    fact("F-5", "营业收入", 1000),
    fact("F-6", "净利润", 80),
    fact("F-8", "平均应收账款", 250),
    { ...fact("F-7", "经营活动产生的现金流量净额", 900), reviewStatus: "已驳回" as const },
  ];
  const metrics = calculateFinancialMetrics(facts);
  assert.equal(metrics.find((item) => item.id === "current-ratio")?.displayValue, "2.00");
  assert.equal(metrics.find((item) => item.id === "debt-ratio")?.displayValue, "60.0%");
  assert.equal(metrics.find((item) => item.id === "net-margin")?.displayValue, "8.0%");
  assert.equal(metrics.find((item) => item.id === "receivables-turnover")?.displayValue, "4.00");
  assert.equal(metrics.some((item) => item.id === "cash-debt-cover"), false);
});

test("缺少分母或分母为零时不编造指标", () => {
  assert.deepEqual(calculateFinancialMetrics([fact("F-1", "流动资产", 600)]), []);
  assert.deepEqual(calculateFinancialMetrics([fact("F-1", "流动资产", 600), fact("F-2", "流动负债", 0)]), []);
});

test("跨期趋势归一化单位并保留事实引用", () => {
  const trends = calculateFinancialTrends([
    fact("F-1", "营业收入", 100, "万元", "2024"),
    fact("F-2", "营业收入", 0.012, "亿元", "2025"),
  ]);
  assert.equal(trends.length, 1);
  assert.equal(trends[0].changeRate, 20);
  assert.deepEqual(trends[0].sourceFactIds, ["F-1", "F-2"]);
});

test("项目报告标识候选风险、事实引用和人工复核要求", () => {
  const evidence = fact("F-1", "营业收入", 1000);
  const report = buildEnterpriseReport({
    project: { id: "CASE-1", company: "测试企业", title: "经营研判", industry: "制造业", amount: "", owner: "张三", progress: 50, status: "研判中", risk: "medium", nextAction: "复核", updatedAt: "2026-08-31" },
    documents: [{ id: "DOC-1", caseId: "CASE-1", name: "2025审计报告.pdf", kind: "审计报告", pages: 10, confidence: 0.95, status: "已解析", facts: 1, ruleHits: 0, uploadedAt: "2026-08-31", factItems: [evidence] }],
    risks: [{ id: "RISK-1", caseId: "CASE-1", company: "测试企业", title: "收入波动", level: "medium", evidence: "见 F-1", rule: "待复核", impact: "经营稳定性", status: "待核验", origin: "AI线索" }],
    rules: [], tasks: [], briefs: [], runs: [],
  });
  assert.match(report, /候选风险/);
  assert.match(report, /\[F-1\]/);
  assert.match(report, /仍有候选风险等待人工确认/);
  assert.match(report, /不替代/);
});
