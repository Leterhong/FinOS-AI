"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  pushDelete,
  pushEntity,
  pullSnapshot,
  type EnterpriseKind,
} from "@/lib/enterprise-sync";
import type {
  AgentRun,
  AnalysisDocument,
  EvidenceFact,
  EnterpriseCase,
  EnterpriseRule,
  ResearchBrief,
  RiskSignal,
  RuleTestRecord,
  WorkflowTask,
} from "@/types/enterprise";

type NewCase = Pick<EnterpriseCase, "company" | "title" | "industry" | "amount" | "owner">;
type NewTask = Pick<WorkflowTask, "title" | "caseName" | "assignee" | "due" | "priority"> & { caseId?: string; note?: string };
type NewRisk = Omit<RiskSignal, "id" | "status">;

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: string;
  model?: string;
  error?: boolean;
  caseId?: string;
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
  activeCaseId: string;
  setActiveCaseId: (id: string) => void;
  createCase: (input: NewCase) => EnterpriseCase;
  updateCase: (id: string, patch: Partial<Pick<EnterpriseCase, "company" | "title" | "industry" | "amount" | "owner" | "status" | "risk" | "nextAction" | "archivedAt" | "classification">>) => void;
  addDocument: (file: File, caseId: string) => AnalysisDocument;
  completeDocumentAnalysis: (id: string, analysis: string, model: string, detail?: { facts?: Array<Omit<EvidenceFact, "id" | "caseId" | "documentId" | "documentName" | "reviewStatus">>; ruleOutcomes?: AnalysisDocument["ruleOutcomes"]; uncertainties?: string[]; extractionMethod?: AnalysisDocument["extractionMethod"]; ocrUsed?: boolean; tables?: AnalysisDocument["tables"] }) => void;
  reviewFact: (documentId: string, factId: string, input: { status: EvidenceFact["reviewStatus"]; reviewer: string; note?: string }) => void;
  failDocumentAnalysis: (id: string, error: string) => void;
  addRisk: (input: NewRisk) => RiskSignal;
  verifyRisk: (id: string, input: { reviewer: string; note: string }) => void;
  mitigateRisk: (id: string, input: { reviewer: string; note: string }) => void;
  addRule: (input: Pick<EnterpriseRule, "code" | "name" | "domain"> & { version?: string; conditions?: EnterpriseRule["conditions"] }) => void;
  testRule: (id: string, record: Omit<RuleTestRecord, "id" | "testedAt">) => void;
  deleteRule: (id: string) => void;
  addTask: (input: NewTask) => void;
  updateTask: (id: string, patch: Partial<Pick<WorkflowTask, "title" | "assignee" | "due" | "priority" | "note" | "stage">>, actor: string, note?: string) => void;
  advanceTask: (id: string, actor: string, note?: string) => void;
  beginAgentRun: (input: { task: string; model?: string; caseId: string; company: string }) => AgentRun;
  completeAgentRun: (id: string, output: string, duration: string) => void;
  failAgentRun: (id: string, error: string, duration: string) => void;
  addBrief: (input: Omit<ResearchBrief, "id" | "createdAt">) => ResearchBrief;
  appendAssistantMessage: (message: Omit<AssistantMessage, "id" | "at">) => void;
  clearAssistantHistory: (caseId?: string) => void;
  /** 从服务端拉取快照并合并（跨设备恢复/备份；后端不可达时静默跳过）。 */
  syncFromServer: () => Promise<{ pulled: boolean; merged: number }>;
  clearWorkspace: () => void;
}

/** 各实体的服务端推送通道与载荷映射（字段对齐 backend/enterprise/router.py）。 */
const syncMap = {
  cases: {
    api: "cases" as EnterpriseKind,
    payload: (item: EnterpriseCase) => ({
      id: item.id, company: item.company, title: item.title, industry: item.industry,
      organizationId: item.organizationId, classification: item.classification ?? "internal",
      amount: item.amount, status: item.status, risk: item.risk, progress: item.progress,
      owner: item.owner, nextAction: item.nextAction, createdAt: item.createdAt, archivedAt: item.archivedAt,
    }),
  },
  documents: {
    api: "documents" as EnterpriseKind,
    payload: (item: AnalysisDocument) => ({
      id: item.id, caseId: item.caseId, name: item.name, kind: item.kind,
      classification: item.classification ?? "internal",
      status: item.status, facts: item.facts, ruleHits: item.ruleHits,
      analysis: item.analysis, model: item.model, error: item.error,
      factItems: item.factItems, ruleOutcomes: item.ruleOutcomes, uncertainties: item.uncertainties,
      extractionMethod: item.extractionMethod, ocrUsed: item.ocrUsed, tables: item.tables,
    }),
  },
  risks: {
    api: "risks" as EnterpriseKind,
    payload: (item: RiskSignal) => ({
      id: item.id, caseId: item.caseId, company: item.company, title: item.title,
      level: item.level, evidence: item.evidence, rule: item.rule, impact: item.impact,
      status: item.status, origin: item.origin, factIds: item.factIds, ruleCodes: item.ruleCodes,
      sourceRunId: item.sourceRunId, verificationNote: item.verificationNote,
      verifiedBy: item.verifiedBy, verifiedAt: item.verifiedAt, mitigationNote: item.mitigationNote,
    }),
  },
  rules: {
    api: "rules" as EnterpriseKind,
    payload: (item: EnterpriseRule) => ({
      id: item.id, code: item.code, name: item.name, domain: item.domain,
      organizationId: item.organizationId,
      version: item.version, coverage: item.coverage, coverageRate: item.coverageRate,
      conditions: item.conditions, testRecords: item.testRecords,
    }),
  },
  tasks: {
    api: "tasks" as EnterpriseKind,
    payload: (item: WorkflowTask) => ({
      id: item.id, caseId: item.caseId, title: item.title, caseName: item.caseName, assignee: item.assignee,
      due: item.due, priority: item.priority, stage: item.stage, note: item.note, history: item.history,
    }),
  },
  briefs: {
    api: "briefs" as EnterpriseKind,
    payload: (item: ResearchBrief) => ({
      id: item.id, caseId: item.caseId, title: item.title, summary: item.summary, topic: item.topic,
      model: item.model,
    }),
  },
} as const;

type SyncKind = keyof typeof syncMap;

/** 服务端同步状态；fire-and-forget，绝不让同步问题阻塞本地交互。 */
let pushFailureCount = 0;

function notePushFailure(): void {
  pushFailureCount += 1;
  if (pushFailureCount === 1 || pushFailureCount % 20 === 0) {
    console.warn(`[enterprise-sync] 服务端推送失败 ${pushFailureCount} 次（本地数据不受影响）`);
  }
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
  activeCaseId: "",
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
    const tasks = state.tasks.filter((t) => t.caseId === item.id
      || (!t.caseId && (t.caseName === `${item.company} · ${item.title}` || t.caseName === item.company)));
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

/**
 * 经 deriveCaseProgress 包裹的 set，保证任何业务变更后项目进度都是真实值。
 * set 是同步应用的，返回后通过 getState() 读取最新状态再做服务端推送。
 */
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
    (set, get) => ({
      ...emptyWorkspace(),
      setActiveCaseId: (id) => set({ activeCaseId: id }),
      createCase: (input) => {
        const item: EnterpriseCase = {
          ...input,
          id: uid("CASE"),
          classification: "internal",
          status: "研判中",
          risk: "medium",
          progress: 0,
          updatedAt: "刚刚",
          nextAction: "配置 AI 模型后上传企业资料",
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ cases: [item, ...state.cases], activeCaseId: item.id }));
        pushEntity("cases", syncMap.cases.payload(item));
        return item;
      },
      updateCase: (id, patch) => {
        withProgress(set, (state) => ({
          cases: state.cases.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        }));
        const updated = get().cases.find((item) => item.id === id);
        if (updated) pushEntity("cases", syncMap.cases.payload(updated));
      },
      addDocument: (file, caseId) => {
        const extension = file.name.split(".").pop()?.toLowerCase();
        const item: AnalysisDocument = {
          id: uid("DOC"),
          caseId,
          classification: "internal",
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
        pushEntity("documents", syncMap.documents.payload(item));
        return item;
      },
      completeDocumentAnalysis: (id, analysis, model, detail) => {
        withProgress(set, (state) => ({
          documents: state.documents.map((document) => {
            if (document.id !== id) return document;
            const factItems: EvidenceFact[] = (detail?.facts ?? []).map((fact) => ({
              ...fact,
              id: uid("FACT"),
              caseId: document.caseId,
              documentId: document.id,
              documentName: document.name,
              reviewStatus: "待复核",
            }));
            const ruleOutcomes = detail?.ruleOutcomes ?? [];
            return {
              ...document,
              status: "已解析",
              analysis,
              model,
              error: undefined,
              facts: factItems.length,
              ruleHits: ruleOutcomes.filter((outcome) => outcome.hit).length,
              factItems,
              ruleOutcomes,
              uncertainties: detail?.uncertainties ?? [],
              extractionMethod: detail?.extractionMethod ?? "text",
              ocrUsed: detail?.ocrUsed ?? false,
              tables: detail?.tables ?? [],
            };
          }),
        }));
        const doc = get().documents.find((d) => d.id === id);
        if (doc) pushEntity("documents", syncMap.documents.payload(doc));
      },
      reviewFact: (documentId, factId, input) => {
        set((state) => ({
          documents: state.documents.map((document) => document.id === documentId
            ? {
                ...document,
                factItems: (document.factItems ?? []).map((fact) => fact.id === factId
                  ? { ...fact, reviewStatus: input.status, reviewedBy: input.reviewer, reviewedAt: new Date().toISOString(), reviewNote: input.note }
                  : fact),
              }
            : document),
        }));
        const doc = get().documents.find((item) => item.id === documentId);
        if (doc) pushEntity("documents", syncMap.documents.payload(doc));
      },
      failDocumentAnalysis: (id, error) => {
        withProgress(set, (state) => ({
          documents: state.documents.map((document) => document.id === id
            ? { ...document, status: "待复核", error }
            : document),
        }));
        const doc = get().documents.find((d) => d.id === id);
        if (doc) pushEntity("documents", syncMap.documents.payload(doc));
      },
      addRisk: (input) => {
        const risk: RiskSignal = { ...input, id: uid("RISK"), status: "待核验", origin: input.origin ?? "人工登记" };
        withProgress(set, (state) => ({ risks: [risk, ...state.risks] }));
        pushEntity("risks", syncMap.risks.payload(risk));
        return risk;
      },
      verifyRisk: (id, input) => {
        withProgress(set, (state) => ({
          risks: state.risks.map((risk) => risk.id === id ? {
            ...risk,
            status: "已确认",
            verificationNote: input.note,
            verifiedBy: input.reviewer,
            verifiedAt: new Date().toISOString(),
          } : risk),
        }));
        const risk = get().risks.find((r) => r.id === id);
        if (risk) pushEntity("risks", syncMap.risks.payload(risk));
      },
      mitigateRisk: (id, input) => {
        withProgress(set, (state) => ({
          risks: state.risks.map((risk) => risk.id === id ? {
            ...risk,
            status: "已缓释",
            mitigationNote: `${input.reviewer}：${input.note}`,
          } : risk),
        }));
        const risk = get().risks.find((r) => r.id === id);
        if (risk) pushEntity("risks", syncMap.risks.payload(risk));
      },
      addRule: (input) => {
        const item: EnterpriseRule = {
          ...input,
          id: uid("RULE"),
          version: input.version?.trim() || "v1.0",
          coverage: "待测试",
          coverageRate: 0,
          updated: today(),
        };
        set((state) => ({ rules: [item, ...state.rules] }));
        pushEntity("rules", syncMap.rules.payload(item));
      },
      testRule: (id, record) => {
        set((state) => ({
          rules: state.rules.map((rule) => {
            if (rule.id !== id) return rule;
            const testRecords = [{ ...record, id: uid("TEST"), testedAt: new Date().toISOString() }, ...(rule.testRecords ?? [])];
            const passed = testRecords.filter((item) => item.passed).length;
            return {
              ...rule,
              testRecords,
              coverage: testRecords.length > 0 && passed === testRecords.length ? "已测试" : "测试未通过",
              coverageRate: Math.round((passed / testRecords.length) * 100),
              updated: today(),
            };
          }),
        }));
        const rule = get().rules.find((r) => r.id === id);
        if (rule) pushEntity("rules", syncMap.rules.payload(rule));
      },
      deleteRule: (id) => {
        set((state) => ({
          rules: state.rules.filter((rule) => rule.id !== id),
        }));
        pushDelete("rules", id);
      },
      addTask: (input) => {
        withProgress(set, (state) => ({
          tasks: [{
            ...input,
            id: uid("TASK"),
            stage: "待处理",
            history: [{ id: uid("EVT"), action: "创建任务", actor: input.assignee || "待指派", at: new Date().toISOString() }],
          }, ...state.tasks],
        }));
        const task = get().tasks.find((t) => t.title === input.title && t.assignee === input.assignee);
        if (task) pushEntity("tasks", syncMap.tasks.payload(task));
      },
      updateTask: (id, patch, actor, note) => {
        set((state) => ({
          tasks: state.tasks.map((task) => {
            if (task.id !== id) return task;
            const stageChanged = patch.stage !== undefined && patch.stage !== task.stage;
            return {
              ...task,
              ...patch,
              history: [{
                id: uid("EVT"),
                action: stageChanged ? "调整任务阶段" : "更新任务",
                actor,
                note,
                at: new Date().toISOString(),
                ...(stageChanged ? { fromStage: task.stage, toStage: patch.stage } : {}),
              }, ...(task.history ?? [])],
            };
          }),
        }));
        const task = get().tasks.find((item) => item.id === id);
        if (task) pushEntity("tasks", syncMap.tasks.payload(task));
      },
      advanceTask: (id, actor, note) => {
        withProgress(set, (state) => {
          const stages: WorkflowTask["stage"][] = ["待处理", "处理中", "待复核", "已完成"];
          return {
            tasks: state.tasks.map((task) => {
              if (task.id !== id) return task;
              const nextStage = stages[Math.min(stages.indexOf(task.stage) + 1, stages.length - 1)];
              return {
                ...task,
                stage: nextStage,
                history: [{ id: uid("EVT"), action: "推进任务", actor, note, at: new Date().toISOString(), fromStage: task.stage, toStage: nextStage }, ...(task.history ?? [])],
              };
            }),
          };
        });
        const task = get().tasks.find((t) => t.id === id);
        if (task) pushEntity("tasks", syncMap.tasks.payload(task));
      },
      beginAgentRun: ({ task, model, caseId, company }) => {
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
          caseId,
          company,
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
        pushEntity("briefs", syncMap.briefs.payload(brief));
        return brief;
      },
      appendAssistantMessage: (message) => set((state) => ({
        assistantMessages: [
          ...state.assistantMessages.slice(-99),
          { ...message, id: uid("MSG"), at: new Date().toISOString() },
        ],
      })),
      clearAssistantHistory: (caseId) => set((state) => ({
        assistantMessages: caseId
          ? state.assistantMessages.filter((message) => message.caseId !== caseId)
          : [],
      })),
      syncFromServer: async () => {
        const snapshot = await pullSnapshot();
        if (!snapshot) return { pulled: false, merged: 0 };
        let merged = 0;
        set((state) => {
          // 合并策略：本地已有同 id 记录时本地优先（本会话是活动源）；
          // 服务端多出的记录按 id 补入——实现换设备恢复与服务端备份。
          const mergeById = <T extends { id: string }>(local: T[], remote: Array<Record<string, unknown>>, adapt: (row: Record<string, unknown>) => T): T[] => {
            const ids = new Set(local.map((item) => item.id));
            let count = 0;
            const additions: T[] = [];
            for (const row of remote) {
              const item = adapt(row);
              if (item?.id && !ids.has(item.id)) {
                additions.push(item);
                ids.add(item.id);
                count += 1;
              }
            }
            merged += count;
            return [...additions, ...local];
          };
          return {
            cases: deriveCaseProgress({
              cases: mergeById(state.cases, snapshot.cases, (row) => ({
                id: String(row.id), company: String(row.company ?? ""), title: String(row.title ?? ""),
                organizationId: row.organizationId as string | undefined,
                classification: (row.classification as EnterpriseCase["classification"]) ?? "internal",
                industry: String(row.industry ?? ""), amount: String(row.amount ?? ""),
                status: (row.status as EnterpriseCase["status"]) ?? "研判中",
                risk: (row.risk as EnterpriseCase["risk"]) ?? "medium",
                progress: Number(row.progress ?? 0), owner: String(row.owner ?? ""),
                updatedAt: "从云端恢复", nextAction: String(row.nextAction ?? ""),
                createdAt: row.createdAt as string | undefined, archivedAt: row.archivedAt as string | undefined,
              })),
              documents: state.documents,
              risks: state.risks,
              tasks: state.tasks,
            }).cases,
            documents: mergeById(state.documents, snapshot.documents, (row) => ({
              id: String(row.id), caseId: String(row.caseId ?? ""), name: String(row.name ?? ""),
              classification: (row.classification as AnalysisDocument["classification"]) ?? "internal",
              kind: String(row.kind ?? "企业资料"), pages: 0,
              status: (row.status as AnalysisDocument["status"]) ?? "已解析",
              confidence: 0, facts: Number(row.facts ?? 0), ruleHits: Number(row.ruleHits ?? 0),
              uploadedAt: "从云端恢复", analysis: (row.analysis as string | undefined),
              model: (row.model as string | undefined), error: (row.error as string | undefined),
              factItems: row.factItems as AnalysisDocument["factItems"],
              ruleOutcomes: row.ruleOutcomes as AnalysisDocument["ruleOutcomes"],
              uncertainties: row.uncertainties as string[] | undefined,
              extractionMethod: row.extractionMethod as AnalysisDocument["extractionMethod"],
              ocrUsed: Boolean(row.ocrUsed), tables: row.tables as AnalysisDocument["tables"],
            })),
            risks: mergeById(state.risks, snapshot.risks, (row) => ({
              id: String(row.id), caseId: String(row.caseId ?? ""), company: String(row.company ?? ""),
              title: String(row.title ?? ""), level: (row.level as RiskSignal["level"]) ?? "medium",
              evidence: String(row.evidence ?? ""), rule: String(row.rule ?? ""),
              impact: String(row.impact ?? ""), status: (row.status as RiskSignal["status"]) ?? "待核验",
              origin: row.origin as RiskSignal["origin"], factIds: row.factIds as string[] | undefined,
              ruleCodes: row.ruleCodes as string[] | undefined, sourceRunId: row.sourceRunId as string | undefined,
              verificationNote: row.verificationNote as string | undefined, verifiedBy: row.verifiedBy as string | undefined,
              verifiedAt: row.verifiedAt as string | undefined, mitigationNote: row.mitigationNote as string | undefined,
            })),
            rules: mergeById(state.rules, snapshot.rules, (row) => ({
              id: String(row.id), code: String(row.code ?? ""), name: String(row.name ?? ""),
              organizationId: row.organizationId as string | undefined,
              domain: String(row.domain ?? ""), version: String(row.version ?? "v1.0"),
              coverage: String(row.coverage ?? "待测试"), coverageRate: Number(row.coverageRate ?? 0),
              conditions: row.conditions as EnterpriseRule["conditions"], testRecords: row.testRecords as EnterpriseRule["testRecords"], updated: "从云端恢复",
            })),
            tasks: mergeById(state.tasks, snapshot.tasks, (row) => ({
              id: String(row.id), caseId: String(row.caseId ?? "") || undefined,
              title: String(row.title ?? ""), caseName: String(row.caseName ?? ""),
              assignee: String(row.assignee ?? ""), due: String(row.due ?? ""),
              priority: (row.priority as WorkflowTask["priority"]) ?? "medium",
              stage: (row.stage as WorkflowTask["stage"]) ?? "待处理", note: row.note as string | undefined,
              history: row.history as WorkflowTask["history"],
            })),
            briefs: mergeById(state.briefs, snapshot.briefs, (row) => ({
              id: String(row.id), caseId: String(row.caseId ?? "") || undefined,
              title: String(row.title ?? ""), summary: String(row.summary ?? ""),
              topic: String(row.topic ?? ""), model: (row.model as string | undefined),
              createdAt: "从云端恢复",
            })),
          };
        });
        return { pulled: true, merged };
      },
      clearWorkspace: () => {
        const current = get();
        // 同步清理服务端备份；否则刷新页面会把刚清空的数据重新恢复回来。
        for (const key of Object.keys(syncMap) as SyncKind[]) {
          for (const item of current[key]) pushDelete(syncMap[key].api, item.id);
        }
        set(emptyWorkspace());
      },
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

export { notePushFailure };
