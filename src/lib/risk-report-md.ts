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
