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

interface EnterpriseState {
  cases: EnterpriseCase[];
  documents: AnalysisDocument[];
  risks: RiskSignal[];
  agents: AgentRun[];
  tasks: WorkflowTask[];
  rules: EnterpriseRule[];
  briefs: ResearchBrief[];
  createCase: (input: NewCase) => EnterpriseCase;
  addDocument: (file: File, caseId: string) => AnalysisDocument;
  completeDocumentAnalysis: (id: string, analysis: string, model: string) => void;
  failDocumentAnalysis: (id: string, error: string) => void;
  addRisk: (input: NewRisk) => RiskSignal;
  verifyRisk: (id: string) => void;
  addRule: (input: Pick<EnterpriseRule, "code" | "name" | "domain">) => void;
  addTask: (input: NewTask) => void;
  advanceTask: (id: string) => void;
  beginAgentRun: (input: { task: string; model?: string }) => AgentRun;
  completeAgentRun: (id: string, output: string, duration: string) => void;
  failAgentRun: (id: string, error: string, duration: string) => void;
  addBrief: (input: Omit<ResearchBrief, "id" | "createdAt">) => ResearchBrief;
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
});

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}`;

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
      completeDocumentAnalysis: (id, analysis, model) => set((state) => ({
        documents: state.documents.map((document) => document.id === id
          ? { ...document, status: "已解析", analysis, model, error: undefined }
          : document),
      })),
      failDocumentAnalysis: (id, error) => set((state) => ({
        documents: state.documents.map((document) => document.id === id
          ? { ...document, status: "待复核", error }
          : document),
      })),
      addRisk: (input) => {
        const risk: RiskSignal = { ...input, id: uid("RISK"), status: "待核验" };
        set((state) => ({ risks: [risk, ...state.risks] }));
        return risk;
      },
      verifyRisk: (id) => set((state) => ({
        risks: state.risks.map((risk) => risk.id === id ? { ...risk, status: "已确认" } : risk),
      })),
      addRule: (input) => set((state) => ({
        rules: [{ ...input, version: "v1.0", coverage: "待测试", updated: new Date().toISOString().slice(0, 10) }, ...state.rules],
      })),
      addTask: (input) => set((state) => ({
        tasks: [{ ...input, id: uid("TASK"), stage: "待处理" }, ...state.tasks],
      })),
      advanceTask: (id) => set((state) => {
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
      clearWorkspace: () => set(emptyWorkspace()),
    }),
    {
      name: "finos-enterprise-workspace-v2",
      version: 3,
      migrate: () => emptyWorkspace(),
    },
  ),
);
