export type RiskLevel = "critical" | "high" | "medium" | "low";
export type CaseStatus = "研判中" | "待复核" | "资料补充" | "已完成";

export interface EnterpriseCase {
  id: string;
  company: string;
  title: string;
  industry: string;
  amount: string;
  status: CaseStatus;
  risk: RiskLevel;
  progress: number;
  owner: string;
  updatedAt: string;
  nextAction: string;
}

export interface RiskSignal {
  id: string;
  caseId: string;
  company: string;
  title: string;
  level: RiskLevel;
  evidence: string;
  rule: string;
  impact: string;
  status: "待核验" | "已确认" | "已缓释";
}

export interface AnalysisDocument {
  id: string;
  caseId: string;
  name: string;
  kind: string;
  pages: number;
  status: "已解析" | "解析中" | "待复核";
  confidence: number;
  facts: number;
  ruleHits: number;
  uploadedAt: string;
  analysis?: string;
  model?: string;
  error?: string;
}

export interface AgentRun {
  id: string;
  name: string;
  role: string;
  status: "运行中" | "已完成" | "失败";
  task: string;
  progress: number;
  duration: string;
  model?: string;
  output?: string;
  error?: string;
  createdAt: string;
}

export interface WorkflowTask {
  id: string;
  title: string;
  caseName: string;
  assignee: string;
  due: string;
  priority: RiskLevel;
  stage: "待处理" | "处理中" | "待复核" | "已完成";
}

export interface EnterpriseRule {
  code: string;
  name: string;
  domain: string;
  version: string;
  coverage: string;
  updated: string;
}

export interface ResearchBrief {
  id: string;
  title: string;
  summary: string;
  topic: string;
  createdAt: string;
  model?: string;
}
