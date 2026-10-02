"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { debouncedStorage } from "@/lib/debounced-storage";
import {
  pushDelete,
  pushEntity,
  pushEntityAwait,
  pullSnapshot,
  type EnterpriseKind,
} from "@/lib/enterprise-sync";
import { evaluateRules, type FactCandidate } from "@/lib/rule-engine";
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
  skill?: { id: string; name: string };
  references?: Array<{ type: string; id?: string; label: string; href: string }>;
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
  /** 批量复核同一份资料的多个事实：一次 set、一次推送（避免 N 次全量 upsert）。 */
  reviewFacts: (documentId: string, factIds: string[], input: { status: EvidenceFact["reviewStatus"]; reviewer: string; note?: string }) => void;
  failDocumentAnalysis: (id: string, error: string) => void;
  addRisk: (input: NewRisk) => RiskSignal;
  verifyRisk: (id: string, input: { reviewer: string; note: string }) => void;
  mitigateRisk: (id: string, input: { reviewer: string; note: string }) => void;
  addRule: (input: Pick<EnterpriseRule, "code" | "name" | "domain"> & { version?: string; conditions?: EnterpriseRule["conditions"]; enabled?: boolean; industries?: string[] }) => void;
  updateRule: (id: string, patch: Partial<Pick<EnterpriseRule, "name" | "domain" | "version" | "conditions" | "enabled" | "industries">>) => void;
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
  /** 把本地工作区全部实体推送到当前后端身份（登录后用于把访客数据迁移到账号）。 */
  pushAllToBackend: () => Promise<void>;
  /** 服务端同步状态（页脚徽标）：synced=已上云，local-only=后端不可达。 */
  serverSync: "unknown" | "synced" | "local-only";
  deleteDocument: (id: string) => void;
  /** 用当前工作区规则对已解析资料重跑确定性规则评估（后建规则也能生效）。 */
  rerunRulesForDocument: (id: string) => { hits: number; total: number } | null;
  clearWorkspace: () => void;
  /** 本地清空工作区（同时清服务端备份由调用方决定前先清本地缓存用）。 */
  purgeLocalWorkspace: () => void;
  /** 账号切换保护：本地工作区若归属其它账号则先清空；返回是否允许迁移本地数据。 */
  guardWorkspaceOwnership: (accountId: string) => boolean;
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
      pages: item.pages, confidence: item.confidence, uploadedAt: item.uploadedAt,
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
      enabled: item.enabled ?? true, industries: item.industries ?? [],
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
  serverSync: "unknown" as EnterpriseState["serverSync"],
});

/** 同毫秒内创建两个实体也不会碰撞（Date.now().toString(36) 会）。 */
const uid = (prefix: string) =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `${prefix}-${crypto.randomUUID().slice(0, 12).toUpperCase()}`
    : `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

const RISK_DONE = new Set<RiskSignal["status"]>(["已确认", "已缓释"]);

const RISK_LEVELS = new Set(["critical", "high", "medium", "low"]);
const RISK_STATUSES = new Set(["待核验", "已确认", "已缓释"]);
const normLevel = (value: unknown): RiskSignal["level"] =>
  (RISK_LEVELS.has(String(value)) ? String(value) : "medium") as RiskSignal["level"];
const normStatus = (value: unknown): RiskSignal["status"] =>
  (RISK_STATUSES.has(String(value)) ? String(value) : "待核验") as RiskSignal["status"];

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
    // 失败/报错资料不计入进度，也不作为「资料已就绪」依据，否则会永久卡在未完成。
    const docs = state.documents.filter((d) => d.caseId === item.id && d.status !== "分析失败" && !d.error);
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
    // 仅在进度满格时提升为「待复核」；用户显式设置的状态（已完成/资料补充）不被推导覆盖。
    const status: EnterpriseCase["status"] = progress >= 100 && item.status !== "已完成" && item.status !== "资料补充" ? "待复核" : item.status;
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
          updatedAt: new Date().toISOString(),
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
          uploadedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
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
              // 提取置信度：有结构化事实视为高，无事实视为低（不再停留在易误解的 0）。
              confidence: factItems.length ? 0.9 : 0.4,
              facts: factItems.length,
              ruleHits: ruleOutcomes.filter((outcome) => outcome.hit).length,
              factItems,
              ruleOutcomes,
              uncertainties: detail?.uncertainties ?? [],
              extractionMethod: detail?.extractionMethod ?? "text",
              ocrUsed: detail?.ocrUsed ?? false,
              tables: detail?.tables ?? [],
              updatedAt: new Date().toISOString(),
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
                updatedAt: new Date().toISOString(),
                factItems: (document.factItems ?? []).map((fact) => fact.id === factId
                  ? { ...fact, reviewStatus: input.status, reviewedBy: input.reviewer, reviewedAt: new Date().toISOString(), reviewNote: input.note }
                  : fact),
              }
            : document),
        }));
        const doc = get().documents.find((item) => item.id === documentId);
        if (doc) pushEntity("documents", syncMap.documents.payload(doc));
      },
      reviewFacts: (documentId, factIds, input) => {
        const targets = new Set(factIds);
        if (targets.size === 0) return;
        set((state) => ({
          documents: state.documents.map((document) => document.id === documentId
            ? {
                ...document,
                updatedAt: new Date().toISOString(),
                factItems: (document.factItems ?? []).map((fact) => targets.has(fact.id)
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
            ? { ...document, status: "分析失败" as const, error, updatedAt: new Date().toISOString() }
            : document),
        }));
        const doc = get().documents.find((d) => d.id === id);
        if (doc) pushEntity("documents", syncMap.documents.payload(doc));
      },
      addRisk: (input) => {
        const risk: RiskSignal = { ...input, id: uid("RISK"), status: "待核验", origin: input.origin ?? "人工登记", updatedAt: new Date().toISOString() };
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
            updatedAt: new Date().toISOString(),
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
            updatedAt: new Date().toISOString(),
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
          enabled: input.enabled ?? true,
          industries: input.industries ?? [],
          updated: new Date().toISOString(),
        };
        set((state) => ({ rules: [item, ...state.rules] }));
        pushEntity("rules", syncMap.rules.payload(item));
      },
      updateRule: (id, patch) => {
        set((state) => ({
          rules: state.rules.map((rule) => rule.id === id ? { ...rule, ...patch, updated: new Date().toISOString() } : rule),
        }));
        const updated = get().rules.find((rule) => rule.id === id);
        if (updated) pushEntity("rules", syncMap.rules.payload(updated));
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
              updated: new Date().toISOString(),
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
      deleteDocument: (id) => {
        withProgress(set, (state) => ({ documents: state.documents.filter((d) => d.id !== id) }));
        pushDelete("documents", id);
      },
      rerunRulesForDocument: (id) => {
        const state = get();
        const doc = state.documents.find((d) => d.id === id);
        if (!doc || doc.status !== "已解析") return null;
        const facts: FactCandidate[] = (doc.factItems ?? []).map((fact) => ({
          topic: fact.topic, value: fact.value, unit: fact.unit as FactCandidate["unit"], quote: fact.quote,
        }));
        const structured = state.rules.filter((rule) => (rule.conditions ?? []).length > 0 && rule.enabled !== false)
          .map((rule) => ({ code: rule.code, name: rule.name, conditions: rule.conditions ?? [] }));
        const outcomes = evaluateRules(facts, structured);
        withProgress(set, (s) => ({
          documents: s.documents.map((d) => d.id === id
            ? { ...d, ruleOutcomes: outcomes, ruleHits: outcomes.filter((o) => o.hit).length, updatedAt: new Date().toISOString() }
            : d),
        }));
        const updated = get().documents.find((d) => d.id === id);
        if (updated) pushEntity("documents", syncMap.documents.payload(updated));
        return { hits: outcomes.filter((o) => o.hit).length, total: outcomes.length };
      },
      addTask: (input) => {
        const task: WorkflowTask = {
          ...input,
          id: uid("TASK"),
          stage: "待处理",
          updatedAt: new Date().toISOString(),
          history: [{ id: uid("EVT"), action: "创建任务", actor: input.assignee || "待指派", at: new Date().toISOString() }],
        };
        withProgress(set, (state) => ({ tasks: [task, ...state.tasks] }));
        pushEntity("tasks", syncMap.tasks.payload(task));
      },
      updateTask: (id, patch, actor, note) => {
        withProgress(set, (state) => ({
          tasks: state.tasks.map((task) => {
            if (task.id !== id) return task;
            const stageChanged = patch.stage !== undefined && patch.stage !== task.stage;
            return {
              ...task,
              ...patch,
              updatedAt: new Date().toISOString(),
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
                updatedAt: new Date().toISOString(),
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
        const brief: ResearchBrief = { ...input, id: uid("BRIEF"), createdAt: new Date().toISOString() };
        set((state) => ({ briefs: [brief, ...state.briefs] }));
        pushEntity("briefs", syncMap.briefs.payload(brief));
        return brief;
      },
      appendAssistantMessage: (message) => set((state) => {
        // 每个项目各自保留最近 100 条，避免多项目共用时互相挤掉。
        const others = state.assistantMessages.filter((item) => item.caseId !== message.caseId);
        const sameCase = state.assistantMessages.filter((item) => item.caseId === message.caseId).slice(-99);
        return {
          assistantMessages: [...others, ...sameCase, { ...message, id: uid("MSG"), at: new Date().toISOString() }],
        };
      }),
      clearAssistantHistory: (caseId) => set((state) => ({
        assistantMessages: caseId
          ? state.assistantMessages.filter((message) => message.caseId !== caseId)
          : [],
      })),
      pushAllToBackend: async () => {
        // 目标账号已有数据时不迁移，避免重复导入；仅把访客本地工作区迁移到空账号。
        const existing = await pullSnapshot();
        if (existing) {
          const total = existing.cases.length + existing.documents.length + existing.risks.length + existing.rules.length + existing.tasks.length + existing.briefs.length;
          if (total > 0) return;
        }
        const state = get();
        if (!state.cases.length && !state.documents.length && !state.risks.length && !state.rules.length && !state.tasks.length && !state.briefs.length) return;

        // 重新生成 id 并重写跨实体引用：避免与访客已存在的服务端行主键冲突（跨用户 upsert 会被拒绝）。
        const newId = (prefix: string) => `${prefix}-${(globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/-/g, "").slice(0, 18).toUpperCase()}`;
        const caseIdMap = new Map<string, string>();
        const factIdMap = new Map<string, string>();
        for (const item of state.cases) caseIdMap.set(item.id, newId("CASE"));
        for (const item of state.documents) for (const fact of item.factItems ?? []) factIdMap.set(fact.id, newId("FACT"));
        const remapCase = (id: string): string => caseIdMap.get(id) ?? id;

        const cases = state.cases.map((item) => ({ ...item, id: caseIdMap.get(item.id)!, organizationId: undefined }));
        const docIdMap = new Map<string, string>();
        for (const item of state.documents) docIdMap.set(item.id, newId("DOC"));
        const documents = state.documents.map((item) => {
          const id = docIdMap.get(item.id)!;
          return {
            ...item,
            id,
            caseId: remapCase(item.caseId),
            factItems: (item.factItems ?? []).map((fact) => ({ ...fact, id: factIdMap.get(fact.id)!, caseId: remapCase(fact.caseId), documentId: id })),
          };
        });
        const risks = state.risks.map((item) => ({ ...item, id: newId("RISK"), caseId: remapCase(item.caseId), factIds: (item.factIds ?? []).map((fid) => factIdMap.get(fid) ?? fid), sourceRunId: undefined }));
        const rules = state.rules.map((item) => ({ ...item, id: newId("RULE"), organizationId: undefined }));
        const tasks = state.tasks.map((item) => ({ ...item, id: newId("TASK"), caseId: item.caseId ? remapCase(item.caseId) : item.caseId }));
        const briefs = state.briefs.map((item) => ({ ...item, id: newId("BRIEF"), caseId: item.caseId ? remapCase(item.caseId) : item.caseId }));

        let failures = 0;
        const push = async (kind: SyncKind, items: Array<{ id: string }>) => {
          const build = syncMap[kind].payload as unknown as (item: unknown) => Record<string, unknown>;
          for (const item of items) {
            try {
              const payload: Record<string, unknown> = { ...build(item) };
              delete payload.organizationId; // 由后端归入账号默认组织
              await pushEntityAwait(syncMap[kind].api, payload);
            } catch {
              failures += 1;
            }
          }
        };
        await push("cases", cases);
        await push("documents", documents);
        await push("risks", risks);
        await push("rules", rules);
        await push("tasks", tasks);
        await push("briefs", briefs);

        // 只要有任何一条失败，就保留本地原数据（含原 ID）并明确报错，
        // 避免「本地换成新 ID、服务端却没有」导致后续永不重试、换设备即丢失。
        if (failures > 0) {
          throw new Error(`本地数据迁移未完成（${failures} 条失败），已保留本机数据，请稍后重试`);
        }

        // 全部成功后本地切换为迁移后的实体，保持与服务端一致，避免重载后出现重复。
        set(() => {
          const derived = deriveCaseProgress({ cases, documents, risks, tasks });
          return { cases: derived.cases, documents: derived.documents, risks, rules, tasks, briefs };
        });
      },
      syncFromServer: async () => {
        const snapshot = await pullSnapshot();
        if (!snapshot) {
          set({ serverSync: "local-only" });
          return { pulled: false, merged: 0 };
        }
        let merged = 0;
        set((state) => {
          // 合并策略：本地已有同 id 记录时本地优先（本会话是活动源）；
          // 服务端多出的记录按 id 补入——实现换设备恢复与服务端备份。
          // LWW 合并：本地缺失 → 补入；双方都有 → 服务端 updatedAt 更新者胜。
          // 此前「本地永远赢」，双设备之间永远看不到对方的修改。
          const tsOf = (value: unknown): number => {
            const parsed = Date.parse(String(value ?? ""));
            return Number.isNaN(parsed) ? 0 : parsed;
          };
          const mergeById = <T extends { id: string }>(local: T[], remote: Array<Record<string, unknown>>, adapt: (row: Record<string, unknown>) => T, localTs?: (item: T) => string): T[] => {
            const byId = new Map(local.map((item) => [item.id, item]));
            let additions = 0;
            let updated = 0;
            const result = [...local];
            for (const row of remote) {
              const item = adapt(row);
              if (!item?.id) continue;
              const existing = byId.get(item.id);
              if (!existing) {
                byId.set(item.id, item);
                result.unshift(item);
                additions += 1;
                continue;
              }
              const remoteTs = tsOf(row.updatedAt ?? row.createdAt);
              const localValue = localTs ? localTs(existing) : "";
              if (remoteTs > 0 && remoteTs > tsOf(localValue)) {
                const at = result.findIndex((entry) => entry.id === item.id);
                result[at] = item;
                updated += 1;
              }
            }
            merged += additions + updated;
            return result;
          };
          // 权限回收后服务端不再返回该项目：清理本地缓存的服务端归属项目及其子数据。
          const remoteCaseIds = new Set(snapshot.cases.map((row) => String(row.id)));
          const prunedCaseIds = new Set(state.cases.filter((item) => item.organizationId && !remoteCaseIds.has(item.id)).map((item) => item.id));
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
                updatedAt: String(row.updatedAt ?? ""), nextAction: String(row.nextAction ?? ""),
                createdAt: row.createdAt as string | undefined, archivedAt: row.archivedAt as string | undefined,
              }), (item) => item.updatedAt),
              documents: state.documents,
              risks: state.risks,
              tasks: state.tasks,
            }).cases.filter((item) => !prunedCaseIds.has(item.id)),
            documents: mergeById(state.documents, snapshot.documents, (row) => ({
              id: String(row.id), caseId: String(row.caseId ?? ""), name: String(row.name ?? ""),
              classification: (row.classification as AnalysisDocument["classification"]) ?? "internal",
              kind: String(row.kind ?? "企业资料"), pages: Number(row.pages ?? 0),
              status: (row.status as AnalysisDocument["status"]) ?? "已解析",
              confidence: Number(row.confidence ?? 0), facts: Number(row.facts ?? 0), ruleHits: Number(row.ruleHits ?? 0),
              uploadedAt: String(row.uploadedAt ?? row.updatedAt ?? ""), analysis: (row.analysis as string | undefined),
              model: (row.model as string | undefined), error: (row.error as string | undefined),
              factItems: row.factItems as AnalysisDocument["factItems"],
              ruleOutcomes: row.ruleOutcomes as AnalysisDocument["ruleOutcomes"],
              uncertainties: row.uncertainties as string[] | undefined,
              extractionMethod: row.extractionMethod as AnalysisDocument["extractionMethod"],
              ocrUsed: Boolean(row.ocrUsed), tables: row.tables as AnalysisDocument["tables"],
              updatedAt: String(row.updatedAt ?? ""),
            }), (item) => item.updatedAt ?? item.uploadedAt).filter((item) => !prunedCaseIds.has(item.caseId)),
            risks: mergeById(state.risks, snapshot.risks, (row) => ({
              id: String(row.id), caseId: String(row.caseId ?? ""), company: String(row.company ?? ""),
              title: String(row.title ?? ""), level: normLevel(row.level),
              evidence: String(row.evidence ?? ""), rule: String(row.rule ?? ""),
              impact: String(row.impact ?? ""), status: normStatus(row.status),
              origin: row.origin as RiskSignal["origin"], factIds: row.factIds as string[] | undefined,
              ruleCodes: row.ruleCodes as string[] | undefined, sourceRunId: row.sourceRunId as string | undefined,
              verificationNote: row.verificationNote as string | undefined, verifiedBy: row.verifiedBy as string | undefined,
              verifiedAt: row.verifiedAt as string | undefined, mitigationNote: row.mitigationNote as string | undefined,
              updatedAt: String(row.updatedAt ?? ""),
            }), (item) => item.updatedAt ?? "").filter((item) => !prunedCaseIds.has(item.caseId)),
            rules: mergeById(state.rules, snapshot.rules, (row) => ({
              id: String(row.id), code: String(row.code ?? ""), name: String(row.name ?? ""),
              organizationId: row.organizationId as string | undefined,
              domain: String(row.domain ?? ""), version: String(row.version ?? "v1.0"),
              coverage: String(row.coverage ?? "待测试"), coverageRate: Number(row.coverageRate ?? 0),
              conditions: row.conditions as EnterpriseRule["conditions"], testRecords: row.testRecords as EnterpriseRule["testRecords"], updated: String(row.updatedAt ?? ""),
              enabled: row.enabled === undefined ? true : Boolean(row.enabled),
              industries: Array.isArray(row.industries) ? (row.industries as string[]) : [],
            }), (item) => item.updated),
            tasks: mergeById(state.tasks, snapshot.tasks, (row) => ({
              id: String(row.id), caseId: String(row.caseId ?? "") || undefined,
              title: String(row.title ?? ""), caseName: String(row.caseName ?? ""),
              assignee: String(row.assignee ?? ""), due: String(row.due ?? ""),
              priority: normLevel(row.priority ?? "medium"),
              stage: (row.stage as WorkflowTask["stage"]) ?? "待处理", note: row.note as string | undefined,
              history: row.history as WorkflowTask["history"],
              updatedAt: String(row.updatedAt ?? ""),
            }), (item) => item.updatedAt ?? "").filter((item) => !item.caseId || !prunedCaseIds.has(item.caseId)),
            briefs: mergeById(state.briefs, snapshot.briefs, (row) => ({
              id: String(row.id), caseId: String(row.caseId ?? "") || undefined,
              title: String(row.title ?? ""), summary: String(row.summary ?? ""),
              topic: String(row.topic ?? ""), model: (row.model as string | undefined),
              createdAt: String(row.createdAt ?? ""),
            }), (item) => item.createdAt).filter((item) => !item.caseId || !prunedCaseIds.has(item.caseId)),
          };
        });
        set({ serverSync: "synced" });
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
      purgeLocalWorkspace: () => {
        // 仅清本地缓存，不触碰任何账号的服务端数据（登出/切换账号用）。
        set(emptyWorkspace());
      },
      guardWorkspaceOwnership: (accountId: string) => {
        if (typeof window === "undefined") return true;
        const key = "finos-workspace-owner";
        const previous = window.localStorage.getItem(key);
        window.localStorage.setItem(key, accountId);
        if (previous && previous !== accountId) {
          // 本地残留的是上一位账号的缓存：清空后再绑定，避免跨账号数据串号。
          set(emptyWorkspace());
          return false;
        }
        return true;
      },
    }),
    {
      name: "finos-enterprise-workspace-v2",
      version: 3,
      // 防抖写入 localStorage：合并高频 set，页面隐藏/卸载前强制落盘。
      storage: createJSONStorage(() => debouncedStorage),
      // 版本升级保留既有数据（此前任何 version+1 都会清空整个工作区）。
      migrate: (persisted) => persisted ?? emptyWorkspace(),
      // 会话中断恢复：刷新/崩溃后残留的「解析中」不可能再有回调来写终态，
      // 重 hydration 时统一回收为「分析失败」，用户可删除该资料后重新上传。
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const stuck = state.documents.filter((d) => d.status === "解析中");
        if (stuck.length === 0) return;
        useEnterpriseStore.setState({
          documents: useEnterpriseStore.getState().documents.map((d) => d.status === "解析中"
            ? { ...d, status: "分析失败" as const, error: "分析在会话结束前未完成，请删除后重新上传" }
            : d),
        });
      },
      // 持久化裁剪：AI 分析原文/Agent 输出/对话历史截断限量，避免长期使用
      // 撞上 localStorage ~5MB 配额后写入失败。
      partialize: (state) => ({
        ...state,
        documents: state.documents.slice(0, 100).map((d) => ({
          ...d,
          // 与服务端上限（60000）对齐：低于该值不再截断，避免刷新后用截断版覆盖服务端完整分析。
          analysis: d.analysis ? d.analysis.slice(0, 60000) : undefined,
        })),
        agents: state.agents.slice(0, 50).map((a) => ({
          ...a,
          output: a.output ? a.output.slice(0, 8000) : undefined,
          error: a.error ? a.error.slice(0, 500) : undefined,
        })),
        assistantMessages: state.assistantMessages.slice(-500),
        briefs: state.briefs.slice(0, 50),
      }),
    },
  ),
);

// 多标签页同步：任一标签页写入持久化数据后，其余标签页重新 hydrate，
// 避免标签页 B 用内存旧态覆盖标签页 A 刚创建的数据（仅浏览器环境生效）。
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === "finos-enterprise-workspace-v2" && event.newValue) {
      void useEnterpriseStore.persist.rehydrate();
    }
  });
}

export { notePushFailure };
