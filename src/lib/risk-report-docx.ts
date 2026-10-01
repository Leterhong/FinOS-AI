"use client";

/**
 * 风险清单 Word 导出：企业基础信息封面、按项目汇总统计、财务指标表、按等级着色的风险明细，
 * 证据原文高亮，附规则命中依据。
 */
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import type { RiskSignal } from "@/types/enterprise";
import type { ExportContext, ExportGroup } from "@/lib/risk-export";
import { HIGHLIGHT_COLOR, LABEL_COLOR, LEVEL_COLOR, LEVEL_LABEL, MUTED_COLOR, buildExportGroups, highlightSegments } from "@/lib/risk-export";

function field(label: string, value: string): Paragraph {
  return new Paragraph({
    spacing: { after: 40 },
    children: [
      new TextRun({ text: label, bold: true, color: LABEL_COLOR }),
      new TextRun({ text: value && value.trim() ? value : "—" }),
    ],
  });
}

function heading(text: string, size = 30): Paragraph {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 220, after: 80 }, children: [new TextRun({ text, bold: true, color: LABEL_COLOR, size })] });
}

function cell(text: string, options: { bold?: boolean; color?: string; fill?: string } = {}): TableCell {
  return new TableCell({
    shading: options.fill ? { fill: options.fill } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [new Paragraph({ children: [new TextRun({ text: text || "—", bold: options.bold, color: options.color })] })],
  });
}

function table(header: string[], rows: string[][]): Table {
  const headerRow = new TableRow({ tableHeader: true, children: header.map((text) => cell(text, { bold: true, color: "1F4E79", fill: "EFF4FA" })) });
  const bodyRows = rows.map((row) => new TableRow({ children: row.map((text) => cell(text)) }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...bodyRows] });
}

function evidenceParagraph(evidence: string, quotes: string[]): Paragraph {
  const segments = highlightSegments(evidence, quotes).map((segment) => new TextRun(
    segment.mark
      ? { text: segment.text, bold: true, color: HIGHLIGHT_COLOR, highlight: "yellow" }
      : { text: segment.text },
  ));
  return new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "关键证据：", bold: true, color: LABEL_COLOR }), ...segments] });
}

export function buildRiskDocument(groups: ExportGroup[], meta: { generatedAt: string; title?: string }): Document {
  const children: Array<Paragraph | Table> = [];
  const totalRisks = groups.reduce((sum, group) => sum + group.stats.total, 0);

  children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: meta.title ?? "企业风险清单", bold: true, color: LABEL_COLOR, size: 52 })] }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `生成时间：${meta.generatedAt}`, color: MUTED_COLOR })] }));
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: `共 ${groups.length} 个项目 / ${totalRisks} 项风险`, color: MUTED_COLOR })] }));

  for (const group of groups) {
    children.push(heading(`项目：${group.project}`, 32));

    if (group.meta) {
      children.push(new Paragraph({ spacing: { before: 80 }, children: [new TextRun({ text: "企业基础信息", bold: true, color: "0E7490" })] }));
      children.push(field("企业名称：", group.meta.company));
      children.push(field("研判任务：", group.meta.title));
      children.push(field("所属行业：", group.meta.industry));
      children.push(field("金额规模：", group.meta.amount));
      children.push(field("负责人：", group.meta.owner));
      children.push(field("项目状态：", `${group.meta.status}　风险等级：${group.meta.risk}　进度：${Math.round(group.meta.progress)}%`));
      children.push(field("数据密级：", group.meta.classification ?? "internal"));
      if (group.meta.createdAt) children.push(field("创建时间：", group.meta.createdAt));
    }

    children.push(new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: "风险汇总", bold: true, color: "0E7490" })] }));
    children.push(field("风险项：", `共 ${group.stats.total} 项　重大 ${group.stats.byLevel.critical} · 高 ${group.stats.byLevel.high} · 中 ${group.stats.byLevel.medium} · 低 ${group.stats.byLevel.low}`));
    children.push(field("核验状态：", `待核验 ${group.stats.pending} · 已确认 ${group.stats.confirmed} · 已缓释 ${group.stats.mitigated}`));
    children.push(field("资料与事实：", `${group.stats.documents} 份资料 · ${group.stats.facts} 条结构化事实`));

    children.push(new Paragraph({ spacing: { before: 120, after: 60 }, children: [new TextRun({ text: "财务指标", bold: true, color: "0E7490" })] }));
    if (group.financialMetrics.length) {
      children.push(table(["指标", "数值", "类别", "口径说明"], group.financialMetrics.map((metric) => [metric.name, metric.displayValue, metric.category, metric.interpretation])));
    } else {
      children.push(new Paragraph({ children: [new TextRun({ text: "当前项目缺少可计算的财务事实（需上传含资产负债/利润/现金流科目的资料）。", color: MUTED_COLOR })] }));
    }
    if (group.financialTrends.length) {
      children.push(new Paragraph({ spacing: { before: 120, after: 60 }, children: [new TextRun({ text: "跨期趋势", bold: true, color: "0E7490" })] }));
      children.push(table(["指标", "期初", "期末", "变化率"], group.financialTrends.map((trend) => [trend.topic, trend.fromPeriod, trend.toPeriod, `${trend.changeRate.toFixed(1)}%`])));
    }

    children.push(new Paragraph({ spacing: { before: 140, after: 60 }, children: [new TextRun({ text: `风险明细（${group.stats.total} 项）`, bold: true, color: "0E7490" })] }));
    group.risks.forEach((risk, index) => {
      children.push(new Paragraph({ spacing: { before: 160, after: 60 }, children: [new TextRun({ text: `${index + 1}. ${risk.title}`, bold: true, size: 26, color: LEVEL_COLOR[risk.level] })] }));
      children.push(new Paragraph({ spacing: { after: 40 }, children: [
        new TextRun({ text: "风险等级：", bold: true, color: LABEL_COLOR }),
        new TextRun({ text: LEVEL_LABEL[risk.level], bold: true, color: LEVEL_COLOR[risk.level] }),
        new TextRun({ text: `　状态：${risk.status}`, color: MUTED_COLOR }),
      ] }));
      children.push(evidenceParagraph(risk.evidence, risk.evidenceQuotes));
      if (risk.ruleRefs) children.push(field("规则命中依据：", risk.ruleRefs));
      if (risk.ruleText) children.push(field("制度/规则条款：", risk.ruleText));
      children.push(field("潜在影响：", risk.impact));
      children.push(field("事实引用：", risk.factIds.join("、") || "无"));
      children.push(field("规则引用：", risk.ruleCodes.join("、") || "无"));
      if (risk.verifiedBy) {
        children.push(new Paragraph({ children: [
          new TextRun({ text: "复核：", bold: true, color: "2E7D32" }),
          new TextRun({ text: `${risk.verifiedBy}${risk.verifiedAt ? ` · ${risk.verifiedAt}` : ""}`, color: "2E7D32" }),
          new TextRun({ text: risk.verificationNote ? `　${risk.verificationNote}` : "", color: "2E7D32" }),
        ] }));
      }
    });
  }

  children.push(new Paragraph({ spacing: { before: 320 }, children: [new TextRun({ text: "本清单由 FinOS AI 生成，仅用于风险提示与人工复核参考，不构成授信、投资、法律、审计或合规意见。", color: "B7791F", italics: true })] }));
  return new Document({ sections: [{ properties: {}, children }] });
}

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
