export type RiskLevel = "critical" | "high" | "medium" | "low";
export type CaseStatus = "研判中" | "待复核" | "资料补充" | "已完成";
export type DataClassification = "public" | "internal" | "confidential" | "restricted";

export interface EnterpriseCase {
  id: string;
  organizationId?: string;
  classification?: DataClassification;
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
  createdAt?: string;
  archivedAt?: string;
}

export type ReviewStatus = "待复核" | "已确认" | "已驳回";

export interface EvidenceCoordinate {
  page?: number;
  line?: number;
  bbox?: [number, number, number, number];
  sheet?: string;
  cell?: string;
  row?: number;
  column?: number;
}

export interface ExtractedTable {
  name: string;
  headers: string[];
  rows: Array<Record<string, string | number | boolean | null>>;
  sheet?: string;
  range?: string;
}

export interface EvidenceFact {
  id: string;
  caseId: string;
  documentId: string;
  documentName: string;
  topic: string;
  value: number;
  unit: string;
  quote: string;
  location?: string;
  coordinate?: EvidenceCoordinate;
  period?: string;
  confidence?: number;
  reviewStatus: ReviewStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
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
  origin?: "AI线索" | "人工登记";
  factIds?: string[];
  ruleCodes?: string[];
  sourceRunId?: string;
  verificationNote?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  mitigationNote?: string;
}

export interface AnalysisDocument {
  id: string;
  caseId: string;
  classification?: DataClassification;
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
  factItems?: EvidenceFact[];
  ruleOutcomes?: Array<{
    code: string;
    name: string;
    hit: boolean;
    reason: string;
    matchedQuote?: string;
  }>;
  uncertainties?: string[];
  extractionMethod?: "text" | "ocr" | "table" | "connector";
  ocrUsed?: boolean;
  tables?: ExtractedTable[];
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
  /** Agent 运行所属项目；缺失表示升级前的未归属历史记录。 */
  caseId?: string;
  company?: string;
}

export interface WorkflowTask {
  id: string;
  title: string;
  caseName: string;
  assignee: string;
  due: string;
  priority: RiskLevel;
  stage: "待处理" | "处理中" | "待复核" | "已完成";
  caseId?: string;
  note?: string;
  history?: WorkflowEvent[];
}

export interface WorkflowEvent {
  id: string;
  action: string;
  actor: string;
  note?: string;
  at: string;
  fromStage?: WorkflowTask["stage"];
  toStage?: WorkflowTask["stage"];
}

import type { RuleCondition } from "@/lib/rule-engine";

export interface EnterpriseRule {
  id: string;
  organizationId?: string;
  code: string;
  name: string;
  domain: string;
  version: string;
  coverage: string;
  /** 覆盖度百分比（0-100）：由「标记为已测试」动作驱动，不再用中文字符串当宽度。 */
  coverageRate: number;
  /** 结构化触发条件（可选）：填写后资料研判会由确定性规则引擎评估命中。 */
  conditions?: RuleCondition[];
  updated: string;
  testRecords?: RuleTestRecord[];
}

export interface RuleTestRecord {
  id: string;
  metric: string;
  actualValue: number;
  unit: "元" | "万元" | "亿元" | "%";
  expectedHit: boolean;
  actualHit: boolean;
  passed: boolean;
  quote: string;
  tester: string;
  testedAt: string;
}

export interface ResearchBrief {
  id: string;
  title: string;
  summary: string;
  topic: string;
  createdAt: string;
  model?: string;
  caseId?: string;
}
