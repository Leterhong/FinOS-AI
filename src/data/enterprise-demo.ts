import type { AgentRun, AnalysisDocument, EnterpriseCase, RiskSignal, WorkflowTask } from "@/types/enterprise";

export const enterpriseCases: EnterpriseCase[] = [
  { id: "CASE-240826-01", company: "晟远新能源集团", title: "流动资金授信研判", industry: "新能源制造", amount: "¥1.20 亿", status: "待复核", risk: "high", progress: 78, owner: "王琳", updatedAt: "12 分钟前", nextAction: "核验关联方资金往来" },
  { id: "CASE-240826-02", company: "华辰精工科技", title: "供应链融资准入", industry: "高端装备", amount: "¥4,800 万", status: "研判中", risk: "medium", progress: 56, owner: "周恺", updatedAt: "26 分钟前", nextAction: "补充前五大客户回款证明" },
  { id: "CASE-240825-07", company: "科泽生物医药", title: "并购融资尽调", industry: "生物医药", amount: "¥2.60 亿", status: "资料补充", risk: "critical", progress: 43, owner: "陈序", updatedAt: "1 小时前", nextAction: "穿透核查对赌与或有负债" },
  { id: "CASE-240825-03", company: "临港数科服务", title: "经营性贷款续授信", industry: "企业服务", amount: "¥3,200 万", status: "已完成", risk: "low", progress: 100, owner: "林乔", updatedAt: "昨天", nextAction: "归档并进入贷后监测" },
];

export const riskSignals: RiskSignal[] = [
  { id: "R-01", caseId: "CASE-240825-07", company: "科泽生物医药", title: "并购标的存在未披露回购安排", level: "critical", evidence: "投资协议补充条款第 4.2 条与管理层访谈记录存在口径差异", rule: "并购融资尽调规则 M&A-17", impact: "可能形成 6,000–8,000 万元或有负债", status: "待核验" },
  { id: "R-02", caseId: "CASE-240826-01", company: "晟远新能源集团", title: "关联方往来占用持续上升", level: "high", evidence: "其他应收款中关联方余额同比上升 67%，经营现金净额连续两期为负", rule: "授信准入规则 CR-08 / CR-21", impact: "短期偿债能力承压，资金用途需穿透", status: "已确认" },
  { id: "R-03", caseId: "CASE-240826-02", company: "华辰精工科技", title: "核心客户集中度超出预警线", level: "medium", evidence: "前两大客户收入占比 52.4%，其中第一大客户回款周期延长 18 天", rule: "供应链融资规则 SCF-12", impact: "订单波动可能放大现金流风险", status: "待核验" },
  { id: "R-04", caseId: "CASE-240826-01", company: "晟远新能源集团", title: "担保链新增交叉互保主体", level: "medium", evidence: "征信资料显示本季度新增 2 家非合并范围互保企业", rule: "担保风险规则 GR-05", impact: "潜在代偿责任约 1,900 万元", status: "已缓释" },
];

export const analysisDocuments: AnalysisDocument[] = [
  { id: "DOC-01", caseId: "CASE-240826-01", name: "晟远新能源_2025审计报告.pdf", kind: "审计报告", pages: 126, status: "已解析", confidence: 96, facts: 184, ruleHits: 7, uploadedAt: "今天 09:42" },
  { id: "DOC-02", caseId: "CASE-240826-01", name: "流动资金借款申请书.docx", kind: "业务申请", pages: 24, status: "待复核", confidence: 91, facts: 48, ruleHits: 3, uploadedAt: "今天 09:45" },
  { id: "DOC-03", caseId: "CASE-240825-07", name: "并购协议及补充协议.pdf", kind: "交易文件", pages: 88, status: "已解析", confidence: 94, facts: 112, ruleHits: 11, uploadedAt: "昨天 17:20" },
  { id: "DOC-04", caseId: "CASE-240826-02", name: "银行流水_近24个月.xlsx", kind: "经营数据", pages: 36, status: "解析中", confidence: 87, facts: 296, ruleHits: 4, uploadedAt: "今天 10:18" },
];

export const agentRuns: AgentRun[] = [
  { id: "A-01", name: "资料理解 Agent", role: "事实抽取与证据定位", status: "运行中", task: "解析华辰精工近 24 个月银行流水", progress: 68, duration: "03:42" },
  { id: "A-02", name: "规则匹配 Agent", role: "制度与准入规则核验", status: "已完成", task: "晟远新能源授信规则匹配", progress: 100, duration: "01:18" },
  { id: "A-03", name: "风险研判 Agent", role: "风险归因与交叉验证", status: "等待输入", task: "等待科泽生物法务访谈纪要", progress: 42, duration: "--" },
  { id: "A-04", name: "投研整理 Agent", role: "行业、舆情与可比公司", status: "已完成", task: "新能源电池材料行业晨报", progress: 100, duration: "02:06" },
];

export const workflowTasks: WorkflowTask[] = [
  { id: "T-01", title: "复核关联方资金占用结论", caseName: "晟远新能源", assignee: "王琳", due: "今天 16:00", priority: "high", stage: "待复核" },
  { id: "T-02", title: "补录前五大客户回款证明", caseName: "华辰精工", assignee: "周恺", due: "明天", priority: "medium", stage: "处理中" },
  { id: "T-03", title: "核验回购安排与对赌条款", caseName: "科泽生物", assignee: "陈序", due: "已超期 2h", priority: "critical", stage: "待处理" },
  { id: "T-04", title: "生成贷后监测基线", caseName: "临港数科", assignee: "林乔", due: "8 月 28 日", priority: "low", stage: "已完成" },
];

export const ruleLibrary = [
  { code: "CR-08", name: "关联方资金占用识别", domain: "授信准入", version: "v3.2", coverage: "92%", updated: "2026-08-19" },
  { code: "M&A-17", name: "或有负债与回购安排核验", domain: "并购融资", version: "v2.4", coverage: "88%", updated: "2026-08-23" },
  { code: "SCF-12", name: "核心客户集中度预警", domain: "供应链金融", version: "v4.0", coverage: "96%", updated: "2026-08-12" },
  { code: "GR-05", name: "担保链与交叉互保穿透", domain: "担保风险", version: "v2.8", coverage: "90%", updated: "2026-08-21" },
];
