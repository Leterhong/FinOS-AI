"use client";

/**
 * 风险清单 Word 导出：生成 .docx，按风险等级用不同颜色标注标题与字段，
 * 便于业务人员直接在 Word 中阅读、批注和流转。
 */
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { RiskSignal } from "@/types/enterprise";

const LABEL_COLOR = "1F4E79";
const MUTED = "808080";
const LEVEL_COLOR: Record<RiskSignal["level"], string> = {
  low: "2E7D32",
  medium: "B7791F",
  high: "C0392B",
  critical: "7B241C",
};
const LEVEL_LABEL: Record<RiskSignal["level"], string> = {
  low: "低风险",
  medium: "中风险",
  high: "高风险",
  critical: "重大风险",
};

function field(label: string, value: string): Paragraph {
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: label, bold: true, color: LABEL_COLOR }),
      new TextRun({ text: value && value.trim() ? value : "—" }),
    ],
  });
}

export function buildRiskDocument(risks: RiskSignal[], meta: { project?: string; generatedAt: string }): Document {
  const children: Paragraph[] = [];

  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: "企业风险清单", bold: true, color: LABEL_COLOR, size: 44 })],
  }));
  children.push(new Paragraph({
    spacing: { after: 200 },
    children: [
      new TextRun({ text: `生成时间：${meta.generatedAt}`, color: MUTED }),
      new TextRun({ text: meta.project ? `　项目：${meta.project}` : "", color: MUTED }),
      new TextRun({ text: `　共 ${risks.length} 项`, color: MUTED }),
    ],
  }));

  risks.forEach((risk, index) => {
    children.push(new Paragraph({
      spacing: { before: 220, after: 80 },
      children: [new TextRun({ text: `${index + 1}. ${risk.title}`, bold: true, size: 28, color: LEVEL_COLOR[risk.level] })],
    }));
    children.push(new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({ text: "风险等级：", bold: true, color: LABEL_COLOR }),
        new TextRun({ text: LEVEL_LABEL[risk.level], bold: true, color: LEVEL_COLOR[risk.level] }),
        new TextRun({ text: `　状态：${risk.status}`, color: MUTED }),
        new TextRun({ text: risk.origin ? `　来源：${risk.origin}` : "", color: MUTED }),
      ],
    }));
    children.push(field("主体：", risk.company));
    children.push(field("关键证据：", risk.evidence));
    children.push(field("规则依据：", risk.rule));
    children.push(field("潜在影响：", risk.impact));
    children.push(field("事实引用：", risk.factIds?.join("、") || "无"));
    children.push(field("规则引用：", risk.ruleCodes?.join("、") || "无"));
    if (risk.verifiedBy) {
      children.push(new Paragraph({
        spacing: { after: 60 },
        children: [
          new TextRun({ text: "复核：", bold: true, color: "2E7D32" }),
          new TextRun({ text: `${risk.verifiedBy}${risk.verifiedAt ? ` · ${risk.verifiedAt}` : ""}`, color: "2E7D32" }),
          new TextRun({ text: risk.verificationNote ? `　${risk.verificationNote}` : "", color: "2E7D32" }),
        ],
      }));
    }
  });

  children.push(new Paragraph({
    spacing: { before: 320 },
    children: [new TextRun({ text: "本清单由 FinOS AI 生成，仅用于风险提示与人工复核参考，不构成授信、投资、法律、审计或合规意见。", color: "B7791F", italics: true })],
  }));

  return new Document({ sections: [{ properties: {}, children }] });
}

/** 生成并下载 .docx 风险清单。 */
export async function downloadRiskChecklist(risks: RiskSignal[], meta: { project?: string } = {}): Promise<void> {
  const doc = buildRiskDocument(risks, { project: meta.project, generatedAt: new Date().toLocaleString("zh-CN") });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `企业风险清单-${new Date().toISOString().slice(0, 10)}.docx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
