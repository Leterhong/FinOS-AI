import type { AgentRun, AnalysisDocument, EnterpriseCase, EnterpriseRule, ResearchBrief, RiskSignal, WorkflowTask } from "@/types/enterprise";
import { calculateFinancialMetrics } from "@/lib/financial-analysis";

export function buildEnterpriseReport(input: {
  project: EnterpriseCase;
  documents: AnalysisDocument[];
  risks: RiskSignal[];
  rules: EnterpriseRule[];
  tasks: WorkflowTask[];
  briefs: ResearchBrief[];
  runs: AgentRun[];
}): string {
  const facts = input.documents.flatMap((document) => document.factItems ?? []);
  const metrics = calculateFinancialMetrics(facts);
  const pendingItems = [
    ...input.documents.flatMap((document) => document.uncertainties ?? []).map((item) => `- ${item}`),
    ...(facts.some((fact) => fact.reviewStatus === "待复核") ? ["- 仍有结构化事实等待人工复核"] : []),
    ...(input.risks.some((risk) => risk.status === "待核验") ? ["- 仍有候选风险等待人工确认"] : []),
  ];
  const lines = [
    `# ${input.project.company} · ${input.project.title} · 项目研判报告`,
    "",
    `- 项目编号：${input.project.id}`,
    `- 所属行业：${input.project.industry || "未填写"}`,
    `- 负责人：${input.project.owner || "未填写"}`,
    `- 生成时间：${new Date().toLocaleString("zh-CN")}`,
    "",
    "> 本报告由 FinOS AI 基于工作区内明确提供的资料生成，仅用于信息分析和辅助决策，不替代审计、法律、投资、授信或审批意见。所有金额、引用、规则命中与风险结论必须由有权限人员对照原始资料复核。",
    "",
    "## 资料与证据",
    "",
    ...(input.documents.length ? input.documents.map((document) => `- ${document.name}：${document.status}，${document.factItems?.length ?? 0} 条结构化事实`) : ["- 尚无资料"]),
    "",
    "## 已抽取事实",
    "",
    ...(facts.length ? facts.map((fact) => `- [${fact.id}] ${fact.topic}：${fact.value}${fact.unit}${fact.period ? `（${fact.period}）` : ""}；位置：${fact.location || "未提供"}；状态：${fact.reviewStatus}\n  - 原文：${fact.quote}`) : ["- 尚无可引用事实"]),
    "",
    "## 财务指标",
    "",
    ...(metrics.length ? metrics.map((metric) => `- ${metric.name}：${metric.displayValue}。${metric.interpretation}（事实：${metric.sourceFactIds.join("、")}）`) : ["- 现有事实不足以计算确定性财务指标"]),
    "",
    "## 规则与风险",
    "",
    ...(input.risks.length ? input.risks.map((risk) => `- ${risk.status === "待核验" ? "候选风险" : "已确认风险"} ${risk.title}（${risk.level}）\n  - 证据：${risk.evidence}\n  - 事实引用：${risk.factIds?.length ? risk.factIds.join("、") : "未关联结构化事实"}\n  - 规则版本：${risk.ruleCodes?.length ? risk.ruleCodes.join("、") : risk.rule || "未关联规则"}\n  - Agent 运行：${risk.sourceRunId || "人工登记或未记录"}\n  - 复核：${risk.verifiedBy ? `${risk.verifiedBy} · ${risk.verifiedAt ?? ""} · ${risk.verificationNote ?? ""}` : "待人工复核"}`) : ["- 尚无风险线索"]),
    "",
    "## 人工流程",
    "",
    ...(input.tasks.length ? input.tasks.map((task) => `- ${task.title}：${task.stage}，负责人 ${task.assignee}，截止 ${task.due}`) : ["- 尚无人工任务"]),
    "",
    "## AI 与研究记录",
    "",
    `- Agent 运行：${input.runs.length} 次`,
    `- 研究底稿：${input.briefs.length} 份`,
    "",
    "## 待补数据与复核要求",
    "",
    ...(pendingItems.length ? pendingItems : ["- 当前未记录待补项，仍应由项目负责人完成最终复核"]),
  ];
  return lines.join("\n");
}
