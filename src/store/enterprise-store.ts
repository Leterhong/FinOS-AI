"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AgentRun,
  AnalysisDocument,
  EnterpriseCase,
  EnterpriseRule,
  ResearchBrief,
  RiskSignal,
  WorkflowTask,
} from "@/types/enterprise";

type NewCase = Pick<EnterpriseCase, "company" | "title" | "industry" | "amount" | "owner">;
type NewTask = Pick<WorkflowTask, "title" | "caseName" | "assignee" | "due" | "priority">;
type NewRisk = Omit<RiskSignal, "id" | "status">;

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: string;
  model?: string;
  error?: boolean;
}

interface EnterpriseState {
  cases: EnterpriseCase[];
  documents: AnalysisDocument[];
  risks: RiskSignal[];
  agents: AgentRun[];
  tasks: WorkflowTask[];
  rules: EnterpriseRule[];
  briefs: ResearchBrief[];
  assistantMessages: AssistantMessage[];
  createCase: (input: NewCase) => EnterpriseCase;
  updateCase: (id: string, patch: Partial<Pick<EnterpriseCase, "status" | "nextAction">>) => void;
  addDocument: (file: File, caseId: string) => AnalysisDocument;
  completeDocumentAnalysis: (id: string, analysis: string, model: string) => void;
  failDocumentAnalysis: (id: string, error: string) => void;
  addRisk: (input: NewRisk) => RiskSignal;
  verifyRisk: (id: string) => void;
  mitigateRisk: (id: string) => void;
  addRule: (input: Pick<EnterpriseRule, "code" | "name" | "domain">) => void;
  testRule: (id: string) => void;
  deleteRule: (id: string) => void;
  addTask: (input: NewTask) => void;
  advanceTask: (id: string) => void;
  beginAgentRun: (input: { task: string; model?: string }) => AgentRun;
  completeAgentRun: (id: string, output: string, duration: string) => void;
  failAgentRun: (id: string, error: string, duration: string) => void;
  addBrief: (input: Omit<ResearchBrief, "id" | "createdAt">) => ResearchBrief;
  appendAssistantMessage: (message: Omit<AssistantMessage, "id" | "at">) => void;
  clearAssistantHistory: () => void;
  clearWorkspace: () => void;
}

const emptyWorkspace = () => ({
  cases: [] as EnterpriseCase[],
  documents: [] as AnalysisDocument[],
  risks: [] as RiskSignal[],
  agents: [] as AgentRun[],
  tasks: [] as WorkflowTask[],
  rules: [] as EnterpriseRule[],
  briefs: [] as ResearchBrief[],
  assistantMessages: [] as AssistantMessage[],
});

/** 同毫秒内创建两个实体也不会碰撞（Date.now().toString(36) 会）。 */
const uid = (prefix: string) =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `${prefix}-${crypto.randomUUID().slice(0, 12).toUpperCase()}`
    : `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

const today = () => new Date().toISOString().slice(0, 10);

const RISK_DONE = new Set<RiskSignal["status"]>(["已确认", "已缓释"]);

/**
 * 项目进度联动：由关联资料解析、风险核验、流程任务推进三类事实推导，
 * 替代「创建后永远 0%」的死字段。结论不虚构——没有任何关联项时保持 0。
 */
function deriveCaseProgress(state: {
  cases: EnterpriseCase[];
  documents: AnalysisDocument[];
  risks: RiskSignal[];
  tasks: WorkflowTask[];
}): { cases: EnterpriseCase[]; documents: AnalysisDocument[] } {
  const nextCases = state.cases.map((item) => {
    const docs = state.documents.filter((d) => d.caseId === item.id);
    const docRatio = docs.length ? docs.filter((d) => d.status === "已解析").length / docs.length : 0;
    const risks = state.risks.filter((r) => r.caseId === item.id);
    const riskRatio = risks.length ? risks.filter((r) => RISK_DONE.has(r.status)).length / risks.length : 0;
    const tasks = state.tasks.filter((t) => t.caseName === `${item.company} · ${item.title}` || t.caseName === item.company);
    const taskRatio = tasks.length ? tasks.filter((t) => t.stage === "已完成").length / tasks.length : 0;

    const hasAny = docs.length + risks.length + tasks.length > 0;
    const progress = hasAny
      ? Math.round((docRatio * 40 + riskRatio * 30 + taskRatio * 30) * 100) / 100
      : 0;
    const nextAction = !docs.length
      ? "上传企业资料并配置适用规则"
      : docRatio < 1
        ? "完成资料 AI 研判"
        : risks.length === 0
          ? "登记 AI 研判发现的风险信号"
          : riskRatio < 1
            ? "核验风险信号"
            : taskRatio < 1
              ? "推进流程任务"
              : "提交人工复核";
    const status: EnterpriseCase["status"] =
      progress >= 100 ? "待复核" : progress > 0 ? item.status === "待复核" ? item.status : "研判中" : item.status;
    return { ...item, progress, nextAction, status };
  });
  // 同步清理：文档不再关联已删除项目时保留原样（不静默丢数据）。
  return { cases: nextCases, documents: state.documents };
}

/** 经 deriveCaseProgress 包裹的 set，保证任何业务变更后项目进度都是真实值。 */
function withProgress(
  set: (fn: (state: EnterpriseState) => Partial<EnterpriseState>) => void,
  updater: (state: EnterpriseState) => Partial<EnterpriseState>,
) {
  set((state) => {
    const patch = updater(state);
    const merged = { ...state, ...patch };
    return { ...patch, ...deriveCaseProgress(merged) };
  });
}

export const useEnterpriseStore = create<EnterpriseState>()(
  persist(
    (set) => ({
      ...emptyWorkspace(),
      createCase: (input) => {
        const item: EnterpriseCase = {
          ...input,
          id: uid("CASE"),
          status: "研判中",
          risk: "medium",
          progress: 0,
          updatedAt: "刚刚",
          nextAction: "上传企业资料并配置适用规则",
        };
        set((state) => ({ cases: [item, ...state.cases] }));
        return item;
      },
      updateCase: (id, patch) => withProgress(set, (state) => ({
        cases: state.cases.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      })),
      addDocument: (file, caseId) => {
        const extension = file.name.split(".").pop()?.toLowerCase();
        const item: AnalysisDocument = {
          id: uid("DOC"),
          caseId,
          name: file.name,
          kind: extension === "xlsx" || extension === "csv" ? "经营数据" : extension === "docx" ? "业务文件" : "企业资料",
          pages: 0,
          status: "解析中",
          confidence: 0,
          facts: 0,
          ruleHits: 0,
          uploadedAt: "刚刚",
        };
        set((state) => ({ documents: [item, ...state.documents] }));
        return item;
      },
      completeDocumentAnalysis: (id, analysis, model) => withProgress(set, (state) => ({
        documents: state.documents.map((document) => document.id === id
          ? { ...document, status: "已解析", analysis, model, error: undefined }
          : document),
      })),
      failDocumentAnalysis: (id, error) => withProgress(set, (state) => ({
        documents: state.documents.map((document) => document.id === id
          ? { ...document, status: "待复核", error }
          : document),
      })),
      addRisk: (input) => {
        const risk: RiskSignal = { ...input, id: uid("RISK"), status: "待核验" };
        withProgress(set, (state) => ({ risks: [risk, ...state.risks] }));
        return risk;
      },
      verifyRisk: (id) => withProgress(set, (state) => ({
        risks: state.risks.map((risk) => risk.id === id ? { ...risk, status: "已确认" } : risk),
      })),
      mitigateRisk: (id) => withProgress(set, (state) => ({
        risks: state.risks.map((risk) => risk.id === id ? { ...risk, status: "已缓释" } : risk),
      })),
      addRule: (input) => set((state) => ({
        rules: [{ ...input, id: uid("RULE"), version: "v1.0", coverage: "待测试", coverageRate: 0, updated: today() }, ...state.rules],
      })),
      testRule: (id) => set((state) => ({
        rules: state.rules.map((rule) => rule.id === id
          ? { ...rule, coverage: "已测试", coverageRate: 100, updated: today() }
          : rule),
      })),
      deleteRule: (id) => set((state) => ({
        rules: state.rules.filter((rule) => rule.id !== id),
      })),
      addTask: (input) => withProgress(set, (state) => ({
        tasks: [{ ...input, id: uid("TASK"), stage: "待处理" }, ...state.tasks],
      })),
      advanceTask: (id) => withProgress(set, (state) => {
        const stages: WorkflowTask["stage"][] = ["待处理", "处理中", "待复核", "已完成"];
        return {
          tasks: state.tasks.map((task) => task.id === id
            ? { ...task, stage: stages[Math.min(stages.indexOf(task.stage) + 1, stages.length - 1)] }
            : task),
        };
      }),
      beginAgentRun: ({ task, model }) => {
        const run: AgentRun = {
          id: uid("RUN"),
          name: "企业风险研判 Agent",
          role: "资料理解 · 规则匹配 · 风险归因",
          status: "运行中",
          task,
          progress: 20,
          duration: "--",
          model,
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ agents: [run, ...state.agents] }));
        return run;
      },
      completeAgentRun: (id, output, duration) => set((state) => ({
        agents: state.agents.map((run) => run.id === id
          ? { ...run, status: "已完成", progress: 100, output, duration }
          : run),
      })),
      failAgentRun: (id, error, duration) => set((state) => ({
        agents: state.agents.map((run) => run.id === id
          ? { ...run, status: "失败", progress: 100, error, duration }
          : run),
      })),
      addBrief: (input) => {
        const brief: ResearchBrief = { ...input, id: uid("BRIEF"), createdAt: "刚刚" };
        set((state) => ({ briefs: [brief, ...state.briefs] }));
        return brief;
      },
      appendAssistantMessage: (message) => set((state) => ({
        assistantMessages: [
          ...state.assistantMessages.slice(-99),
          { ...message, id: uid("MSG"), at: new Date().toISOString() },
        ],
      })),
      clearAssistantHistory: () => set({ assistantMessages: [] }),
      clearWorkspace: () => set(emptyWorkspace()),
    }),
    {
      name: "finos-enterprise-workspace-v2",
      version: 3,
      migrate: () => emptyWorkspace(),
      // 持久化裁剪：AI 分析原文/Agent 输出/对话历史截断限量，避免长期使用
      // 撞上 localStorage ~5MB 配额后写入失败。
      partialize: (state) => ({
        ...state,
        documents: state.documents.slice(0, 100).map((d) => ({
          ...d,
          analysis: d.analysis ? d.analysis.slice(0, 8000) : undefined,
        })),
        agents: state.agents.slice(0, 50).map((a) => ({
          ...a,
          output: a.output ? a.output.slice(0, 8000) : undefined,
          error: a.error ? a.error.slice(0, 500) : undefined,
        })),
        assistantMessages: state.assistantMessages.slice(-100),
        briefs: state.briefs.slice(0, 50),
      }),
    },
  ),
);
