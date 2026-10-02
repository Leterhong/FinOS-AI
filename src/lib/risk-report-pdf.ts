"use client";

/** 风险清单 PDF 导出：由后端 reportlab 渲染（中文内置字体），前端下载 blob。 */
import type { RiskSignal } from "@/types/enterprise";
import { backendAuthedFetch } from "@/lib/enterprise-sync";
import type { ExportContext } from "@/lib/risk-export";
import { buildExportGroups } from "@/lib/risk-export";
import { triggerDownload } from "@/lib/download";

export async function downloadRiskPdf(risks: RiskSignal[], context: ExportContext): Promise<void> {
  const groups = buildExportGroups(risks, context);
  const resp = await backendAuthedFetch("/api/reports/risk-checklist.pdf", {
    method: "POST",
    body: JSON.stringify({ generatedAt: new Date().toLocaleString("zh-CN"), groups }),
  });
  if (!resp.ok) throw new Error("PDF 导出失败");
  const blob = await resp.blob();
  triggerDownload(blob, `企业风险清单-${new Date().toISOString().slice(0, 10)}.pdf`);
}
