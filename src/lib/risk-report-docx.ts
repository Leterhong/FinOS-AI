"use client";

/**
 * 风险清单 Word 导出：按项目分章节、按等级着色，证据原文高亮，附规则命中依据。
 */
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { RiskSignal } from "@/types/enterprise";
import type { ExportContext, ExportGroup } from "@/lib/risk-export";
import { HIGHLIGHT_COLOR, LABEL_COLOR, LEVEL_COLOR, LEVEL_LABEL, MUTED_COLOR, buildExportGroups, highlightSegments } from "@/lib/risk-export";

function field(label: string, value: string): Paragraph {
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: label, bold: true, color: LABEL_COLOR }),
      new TextRun({ text: value && value.trim() ? value : "—" }),
    ],
  });
}

function evidenceParagraph(evidence: string, quotes: string[]): Paragraph {
  const segments = highlightSegments(evidence, quotes).map((segment) => new TextRun(
    segment.mark
      ? { text: segment.text, bold: true, color: HIGHLIGHT_COLOR, highlight: "yellow" }
      : { text: segment.text },
  ));
  return new Paragraph({
    spacing: { after: 60 },
    children: [new TextRun({ text: "关键证据：", bold: true, color: LABEL_COLOR }), ...segments],
  });
}

export function buildRiskDocument(groups: ExportGroup[], meta: { generatedAt: string; title?: string }): Document {
  const children: Paragraph[] = [];
  const total = groups.reduce((sum, group) => sum + group.risks.length, 0);

  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: meta.title ?? "企业风险清单", bold: true, color: LABEL_COLOR, size: 44 })] }));
  children.push(new Paragraph({ spacing: { after: 200 }, children: [
    new TextRun({ text: `生成时间：${meta.generatedAt}`, color: MUTED_COLOR }),
    new TextRun({ text: `　共 ${groups.length} 个项目 / ${total} 项风险`, color: MUTED_COLOR }),
  ] }));

  groups.forEach((group) => {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 260, after: 100 }, children: [new TextRun({ text: `项目：${group.project}`, bold: true, color: LABEL_COLOR, size: 30 })] }));
    group.risks.forEach((risk, index) => {
      children.push(new Paragraph({ spacing: { before: 200, after: 80 }, children: [new TextRun({ text: `${index + 1}. ${risk.title}`, bold: true, size: 26, color: LEVEL_COLOR[risk.level] })] }));
      children.push(new Paragraph({ spacing: { after: 60 }, children: [
        new TextRun({ text: "风险等级：", bold: true, color: LABEL_COLOR }),
        new TextRun({ text: LEVEL_LABEL[risk.level], bold: true, color: LEVEL_COLOR[risk.level] }),
        new TextRun({ text: `　状态：${risk.status}`, color: MUTED_COLOR }),
      ] }));
      children.push(evidenceParagraph(risk.evidence, risk.evidenceQuotes));
      if (risk.ruleRefs || risk.ruleText) children.push(field("规则命中依据：", risk.ruleRefs || risk.ruleText));
      if (risk.ruleRefs && risk.ruleText) children.push(field("制度/规则条款：", risk.ruleText));
      children.push(field("潜在影响：", risk.impact));
      children.push(field("事实引用：", risk.factIds.join("、") || "无"));
      children.push(field("规则引用：", risk.ruleCodes.join("、") || "无"));
      if (risk.verifiedBy) {
        children.push(new Paragraph({ spacing: { after: 60 }, children: [
          new TextRun({ text: "复核：", bold: true, color: "2E7D32" }),
          new TextRun({ text: `${risk.verifiedBy}${risk.verifiedAt ? ` · ${risk.verifiedAt}` : ""}`, color: "2E7D32" }),
          new TextRun({ text: risk.verificationNote ? `　${risk.verificationNote}` : "", color: "2E7D32" }),
        ] }));
      }
    });
  });

  children.push(new Paragraph({ spacing: { before: 320 }, children: [new TextRun({ text: "本清单由 FinOS AI 生成，仅用于风险提示与人工复核参考，不构成授信、投资、法律、审计或合规意见。", color: "B7791F", italics: true })] }));
  return new Document({ sections: [{ properties: {}, children }] });
}

/** 生成并下载 .docx 风险清单。 */
export async function downloadRiskChecklist(risks: RiskSignal[], context: ExportContext, meta: { generatedAt: string } = { generatedAt: "" }): Promise<void> {
  const groups = buildExportGroups(risks, context);
  const doc = buildRiskDocument(groups, { generatedAt: meta.generatedAt || new Date().toLocaleString("zh-CN") });
  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `企业风险清单-${new Date().toISOString().slice(0, 10)}.docx`);
}

export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
