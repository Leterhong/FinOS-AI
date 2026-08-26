"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { agentRuns, analysisDocuments, enterpriseCases, riskSignals, ruleLibrary, workflowTasks } from "@/data/enterprise-demo";
import type { AgentRun, AnalysisDocument, EnterpriseCase, EnterpriseRule, ResearchBrief, RiskSignal, WorkflowTask } from "@/types/enterprise";

type NewCase = Pick<EnterpriseCase, "company" | "title" | "industry" | "amount" | "owner">;
type NewTask = Pick<WorkflowTask, "title" | "caseName" | "assignee" | "due" | "priority">;

interface EnterpriseState {
  cases: EnterpriseCase[];
  documents: AnalysisDocument[];
  risks: RiskSignal[];
  agents: AgentRun[];
  tasks: WorkflowTask[];
  rules: EnterpriseRule[];
  briefs: ResearchBrief[];
  createCase: (input: NewCase) => EnterpriseCase;
  addDocument: (file: File, caseId?: string) => AnalysisDocument;
  verifyRisk: (id: string) => void;
  addRule: (input: Pick<EnterpriseRule, "code" | "name" | "domain">) => void;
  addTask: (input: NewTask) => void;
  advanceTask: (id: string) => void;
  startAgentRun: () => void;
  completeAgentRun: () => void;
  createBrief: (topic: string) => ResearchBrief;
  resetWorkspace: () => void;
}

const initial = {
  cases: enterpriseCases,
  documents: analysisDocuments,
  risks: riskSignals,
  agents: agentRuns,
  tasks: workflowTasks,
  rules: ruleLibrary,
  briefs: [] as ResearchBrief[],
};

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}`;

export const useEnterpriseStore = create<EnterpriseState>()(
  persist(
    (set, get) => ({
      ...initial,
      createCase: (input) => {
        const item: EnterpriseCase = {
          ...input,
          id: uid("CASE"),
          status: "研判中",
          risk: "medium",
          progress: 8,
          updatedAt: "刚刚",
          nextAction: "上传企业基础资料",
        };
        set((state) => ({ cases: [item, ...state.cases] }));
        return item;
      },
      addDocument: (file, caseId = get().cases[0]?.id ?? "CASE-DEMO") => {
        const extension = file.name.split(".").pop()?.toLowerCase();
        const item: AnalysisDocument = {
          id: uid("DOC"), caseId, name: file.name,
          kind: extension === "xlsx" || extension === "csv" ? "经营数据" : extension === "docx" ? "业务申请" : "企业资料",
          pages: Math.max(1, Math.ceil(file.size / 18000)), status: "待复核", confidence: 88, facts: 0, ruleHits: 0, uploadedAt: "刚刚",
        };
        set((state) => ({ documents: [item, ...state.documents] }));
        return item;
      },
      verifyRisk: (id) => set((state) => ({ risks: state.risks.map((risk) => risk.id === id ? { ...risk, status: "已确认" } : risk) })),
      addRule: (input) => set((state) => ({ rules: [{ ...input, version: "v1.0", coverage: "待测试", updated: new Date().toISOString().slice(0, 10) }, ...state.rules] })),
      addTask: (input) => set((state) => ({ tasks: [{ ...input, id: uid("TASK"), stage: "待处理" }, ...state.tasks] })),
      advanceTask: (id) => set((state) => {
        const stages: WorkflowTask["stage"][] = ["待处理", "处理中", "待复核", "已完成"];
        return { tasks: state.tasks.map((task) => task.id === id ? { ...task, stage: stages[Math.min(stages.indexOf(task.stage) + 1, stages.length - 1)] } : task) };
      }),
      startAgentRun: () => set((state) => ({ agents: state.agents.map((agent, index) => index === 0 ? { ...agent, status: "运行中", progress: 12, task: "正在解析最新上传的企业资料", duration: "00:01" } : index === 1 ? { ...agent, status: "等待输入", progress: 0, task: "等待资料理解 Agent 输出" } : agent) })),
      completeAgentRun: () => set((state) => ({ agents: state.agents.map((agent, index) => index < 2 ? { ...agent, status: "已完成", progress: 100, duration: index === 0 ? "00:08" : "00:03" } : agent) })),
      createBrief: (topic) => {
        const brief: ResearchBrief = { id: uid("BRIEF"), topic, title: `${topic}经营与风险专题研究`, summary: `已围绕${topic}汇总监管政策、行业变化、可比企业与风险信号，并生成可引用研究底稿。`, createdAt: "刚刚" };
        set((state) => ({ briefs: [brief, ...state.briefs] }));
        return brief;
      },
      resetWorkspace: () => set(initial),
    }),
    { name: "finos-enterprise-workspace-v2", version: 2 },
  ),
);
