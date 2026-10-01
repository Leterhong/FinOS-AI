"use client";

/** 风险清单 Markdown 导出：按项目分章节、按等级标注、证据原文高亮（==高亮==）。 */
import type { RiskSignal } from "@/types/enterprise";
import type { ExportContext } from "@/lib/risk-export";
import { LEVEL_LABEL, buildExportGroups, highlightSegments } from "@/lib/risk-export";
import { triggerDownload } from "@/lib/risk-report-docx";

function mdHighlight(text: string, quotes: string[]): string {
  return highlightSegments(text, quotes)
    .map((segment) => (segment.mark ? `==${segment.text}==` : segment.text))
    .join("");
}

export function buildRiskMarkdown(risks: RiskSignal[], context: ExportContext, generatedAt: string): string {
  const groups = buildExportGroups(risks, context);
  const total = groups.reduce((sum, group) => sum + group.risks.length, 0);
  const lines: string[] = [
    "# 企业风险清单",
    "",
    `> 生成时间：${generatedAt}　共 ${groups.length} 个项目 / ${total} 项风险`,
    "",
  ];
  for (const group of groups) {
    lines.push(`## 项目：${group.project}`, "");
    if (group.meta) {
      lines.push("### 企业基础信息", "");
      lines.push(`- 企业名称：${group.meta.company}`);
      lines.push(`- 研判任务：${group.meta.title}`);
      lines.push(`- 所属行业：${group.meta.industry}`);
      lines.push(`- 金额规模：${group.meta.amount}`);
      lines.push(`- 负责人：${group.meta.owner}`);
      lines.push(`- 项目状态：${group.meta.status}　风险等级：${group.meta.risk}　进度：${Math.round(group.meta.progress)}%`);
      lines.push(`- 数据密级：${group.meta.classification ?? "internal"}`);
      if (group.meta.createdAt) lines.push(`- 创建时间：${group.meta.createdAt}`);
      lines.push("");
    }
    lines.push("### 风险汇总", "");
    lines.push(`- 风险项：共 ${group.stats.total} 项（重大 ${group.stats.byLevel.critical} · 高 ${group.stats.byLevel.high} · 中 ${group.stats.byLevel.medium} · 低 ${group.stats.byLevel.low}）`);
    lines.push(`- 核验状态：待核验 ${group.stats.pending} · 已确认 ${group.stats.confirmed} · 已缓释 ${group.stats.mitigated}`);
    lines.push(`- 资料与事实：${group.stats.documents} 份资料 · ${group.stats.facts} 条结构化事实`);
    lines.push("");
    lines.push("### 财务指标", "");
    if (group.financialMetrics.length) {
      lines.push("| 指标 | 数值 | 类别 | 口径说明 |");
      lines.push("| --- | --- | --- | --- |");
      for (const metric of group.financialMetrics) lines.push(`| ${metric.name} | ${metric.displayValue} | ${metric.category} | ${metric.interpretation} |`);
    } else {
      lines.push("当前项目缺少可计算的财务事实（需上传含资产负债/利润/现金流科目的资料）。");
    }
    lines.push("");
    if (group.financialTrends.length) {
      lines.push("### 跨期趋势", "");
      lines.push("| 指标 | 期初 | 期末 | 变化率 |");
      lines.push("| --- | --- | --- | --- |");
      for (const trend of group.financialTrends) lines.push(`| ${trend.topic} | ${trend.fromPeriod} | ${trend.toPeriod} | ${trend.changeRate.toFixed(1)}% |`);
      lines.push("");
    }
    lines.push(`### 风险明细（${group.stats.total} 项）`, "");
    group.risks.forEach((risk, index) => {
      lines.push(`### ${index + 1}. ${risk.title}`, "");
      lines.push(`- 风险等级：**${LEVEL_LABEL[risk.level]}**　状态：${risk.status}`);
      lines.push(`- 主体：${risk.company}`);
      lines.push(`- 关键证据：${mdHighlight(risk.evidence, risk.evidenceQuotes)}`);
      if (risk.ruleRefs) lines.push(`- 规则命中依据：${risk.ruleRefs}`);
      if (risk.ruleText) lines.push(`- 制度/规则条款：${risk.ruleText}`);
      lines.push(`- 潜在影响：${risk.impact}`);
      lines.push(`- 事实引用：${risk.factIds.join("、") || "无"}　规则引用：${risk.ruleCodes.join("、") || "无"}`);
      if (risk.verifiedBy) lines.push(`- 复核：${risk.verifiedBy}${risk.verifiedAt ? ` · ${risk.verifiedAt}` : ""}${risk.verificationNote ? `　${risk.verificationNote}` : ""}`);
      lines.push("");
    });
  }
  lines.push("---", "", "本清单由 FinOS AI 生成，仅用于风险提示与人工复核参考，不构成授信、投资、法律、审计或合规意见。", "");
  return lines.join("\n");
}

export function downloadRiskMarkdown(risks: RiskSignal[], context: ExportContext): void {
  const markdown = buildRiskMarkdown(risks, context, new Date().toLocaleString("zh-CN"));
  triggerDownload(new Blob([markdown], { type: "text/markdown;charset=utf-8" }), `企业风险清单-${new Date().toISOString().slice(0, 10)}.md`);
}
