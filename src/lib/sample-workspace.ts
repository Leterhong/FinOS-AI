import type {
  AnalysisDocument,
  EnterpriseCase,
  EnterpriseRule,
  ResearchBrief,
  RiskSignal,
  WorkflowTask,
} from "@/types/enterprise";

/**
 * 一键示例项目：仅在用户主动点击时载入，全部记录使用 `SAMPLE-` 前缀 id，
 * 便于「一键清除」精确移除、绝不污染真实数据。界面上以「【示例】」标注。
 */

export interface SampleWorkspace {
  cases: EnterpriseCase[];
  documents: AnalysisDocument[];
  risks: RiskSignal[];
  rules: EnterpriseRule[];
  tasks: WorkflowTask[];
  briefs: ResearchBrief[];
}

export function buildSampleWorkspace(now: Date = new Date()): SampleWorkspace {
  const iso = (offsetHours: number) => new Date(now.getTime() - offsetHours * 3_600_000).toISOString();
  const due = new Date(now.getTime() + 3 * 86_400_000).toISOString().slice(0, 10);
  const caseId = "SAMPLE-CASE-1";
  const docId = "SAMPLE-DOC-1";
  const docName = "【示例】华兴精密2024年度审计报告（节选）.pdf";

  const cases: EnterpriseCase[] = [{
    id: caseId,
    company: "【示例】华兴精密制造股份有限公司",
    title: "流动资金贷款尽调",
    industry: "制造业",
    amount: "5000万元",
    status: "研判中",
    risk: "high",
    progress: 0,
    owner: "示例用户",
    nextAction: "复核经营现金流与客户集中度",
    classification: "internal",
    organizationId: undefined,
    createdAt: iso(72),
    updatedAt: iso(1),
  }];

  const rules: EnterpriseRule[] = [{
    id: "SAMPLE-RULE-1",
    code: "SAMPLE-OCF",
    name: "经营现金流为负警戒",
    domain: "授信",
    version: "v1.0",
    coverage: "已测试",
    coverageRate: 100,
    conditions: [{ metric: "经营活动产生的现金流量净额", op: "lt", value: 0 }],
    enabled: true,
    industries: ["制造业"],
    updated: iso(90),
    testRecords: [],
  }];

  const documents: AnalysisDocument[] = [{
    id: docId,
    caseId,
    name: docName,
    kind: "企业资料",
    classification: "internal",
    pages: 48,
    status: "已解析",
    confidence: 0.94,
    facts: 3,
    ruleHits: 1,
    uploadedAt: iso(70),
    updatedAt: iso(69),
    model: "示例模型",
    analysis: "【示例数据】报告期内营业收入 42,800 万元，同比增长 11.3%；经营活动现金流量净额 -860 万元；前五大客户收入占比 61.2%。",
    factItems: [
      { id: "SAMPLE-FACT-1", documentId: docId, documentName: docName, caseId, topic: "营业收入", value: 42800, unit: "万元", quote: "报告期内实现营业收入 42,800 万元", location: "第 12 页 · 利润表", period: "2024", reviewStatus: "已确认", confidence: 0.95 },
      { id: "SAMPLE-FACT-2", documentId: docId, documentName: docName, caseId, topic: "经营活动产生的现金流量净额", value: -860, unit: "万元", quote: "经营活动产生的现金流量净额为 -860 万元", location: "第 15 页 · 现金流量表", period: "2024", reviewStatus: "待复核", confidence: 0.9 },
      { id: "SAMPLE-FACT-3", documentId: docId, documentName: docName, caseId, topic: "前五大客户收入占比", value: 61.2, unit: "%", quote: "前五大客户合计收入占比 61.2%", location: "第 31 页 · 附注六", period: "2024", reviewStatus: "待复核", confidence: 0.9 },
    ],
    ruleOutcomes: [{
      code: "SAMPLE-OCF",
      name: "经营现金流为负警戒",
      hit: true,
      reason: "经营活动现金流量净额 -860 万元低于阈值 0",
      matchedQuote: "经营活动产生的现金流量净额为 -860 万元",
    }],
    uncertainties: ["【示例数据】缺少分客户回款账期明细"],
    extractionMethod: "text",
    ocrUsed: false,
    tables: [],
  }];

  const risks: RiskSignal[] = [{
    id: "SAMPLE-RISK-1",
    caseId,
    company: "【示例】华兴精密制造股份有限公司",
    title: "经营现金流为负，收入增长与回款背离",
    level: "critical",
    evidence: "【示例数据】2024 年经营活动现金流净额 -860 万元，同期营业收入增长 11.3%。",
    rule: "SAMPLE-OCF@v1.0",
    impact: "短期偿付能力承压，授信后可能依赖外部融资维持周转。",
    status: "待核验",
    origin: "规则命中",
    factIds: ["SAMPLE-FACT-1", "SAMPLE-FACT-2"],
    ruleCodes: ["SAMPLE-OCF"],
    updatedAt: iso(2),
  }];

  const tasks: WorkflowTask[] = [{
    id: "SAMPLE-TASK-1",
    title: "补充近三年经营活动现金流明细",
    caseName: "【示例】华兴精密制造股份有限公司 · 流动资金贷款尽调",
    assignee: "示例用户",
    due,
    priority: "high",
    stage: "待处理",
    caseId,
    note: "【示例数据】联系企业财务提供盖章版现金流明细",
    history: [{ id: "SAMPLE-EVENT-1", action: "创建任务", actor: "示例用户", at: iso(70) }],
    updatedAt: iso(70),
  }];

  const briefs: ResearchBrief[] = [{
    id: "SAMPLE-BRIEF-1",
    caseId,
    topic: "核心客户集中度对经营现金流的影响",
    title: "【示例】核心客户集中度对经营现金流的影响 · AI 研究底稿",
    model: "示例模型",
    createdAt: iso(3),
    summary: "# 一、结论摘要\n\n【示例数据】客户集中度偏高与经营现金流为负同时存在，尚不能判定因果，需补充分客户回款账期与银行流水。\n\n# 二、待补充来源\n\n- 企业盖章的近三年分客户销售收入与回款台账。",
  }];

  return { cases, documents, risks, rules, tasks, briefs };
}

/** 是否为示例数据（由 id 前缀判定）。 */
export function isSampleId(id: string | undefined | null): boolean {
  return typeof id === "string" && id.startsWith("SAMPLE-");
}
