"use client";

import { create } from "zustand";
import type {
  FinancialProfile,
  CashFlow,
  RiskMetrics,
  ProjectionPoint,
  AssetClass,
  MonthlyTrend,
  AgentResult,
  ChatMessage,
  AgentKey,
} from "@/data/types";
import { EMPTY_PROFILE } from "@/data/types";
import type { AgentAnalysis } from "@/agents/types";
import type { WorkflowPhase, AITask, ChatIntent } from "@/ai/types";
import type { ToolCallRecord } from "@/ai/tools/types";
import type { TwinSnapshot, WealthHealthScore } from "@/twin/engine";
import type { InvestmentTwin } from "@/twin/investment";
import type { AdvisorAlert } from "@/twin/advisor";
import type { MonitoringResult, GoalProgress } from "@/ai/monitoring";
import type {
  ProactiveResult,
  ProactiveSettings,
  ProactiveNotification,
  ScheduleStatus,
  DailyBrief,
} from "@/ai/proactive";
import type {
  PublicFinanceSource,
  FinanceSourceInput,
  PortfolioView,
  PortfolioAnalysis,
  PortfolioValuePoint,
  MarketOverview,
  FinanceNewsItem,
  InvestmentIntelligenceResult,
} from "@/finance/types";
import type { FinanceProviderPreset } from "@/finance/providers/presets";
import type { WealthTask } from "@/wealth/tasks";
import type { WealthPlan } from "@/ai/plan/generator";
import type { ReviewReport, ReviewType } from "@/ai/review";
import type { ActionPlanJSON } from "@/ai/agents/action-agent";
import type {
  FinancialDataSummary,
  FinancialInsight,
  NormalizedTransaction,
  AssetHolding,
  ImportSource,
  ImportBatch,
  DatasetMeta,
} from "@/financial-data/types";
import {
  scenarios,
  computeCashFlow,
  computeRiskMetrics,
  computeProjection,
  buildAssetAllocation,
  computeProjectedRetireAge,
  applyScenario,
  deriveMonthlyTrend,
} from "@/scenario/scenario-engine";

// AI 执行已迁移到服务端：浏览器仅通过 fetch 调用 /api/ai/* 路由，
// 由服务端持有密钥并运行 WorkflowEngine。Store 只负责保存用户数据、Agent 状态与结果。
import { runWorkflowSSE, runChatSSE } from "@/ai/client";
import type { WorkflowEvent } from "@/ai/types";

// ── Base / Initial Profile ───────────────────────────────────────────────────
// 未加载任何真实用户时的中性占位：直接使用 EMPTY_PROFILE（全零、无真实人物数据）。
// 系统不存在任何演示 / 默认画像，所有画像必须来源于真实注册用户输入。
// 关键：禁止任何硬编码财富数据（含默认退休目标 800 万 / 60 岁）。

const baseProfile = EMPTY_PROFILE;

function recomputeProfile(base: FinancialProfile, eventIds: string[]): FinancialProfile {
  let profile = { ...base, modifiers: { ...base.modifiers } };
  for (const id of eventIds) {
    profile = applyScenario(profile, id);
  }
  return profile;
}

// ════════════════════════════════════════════════════════════════════════════
// Phase 7.0.2 数据通道分区（#293 务实版，不重写本 store）
//
// 【UI / 交互状态（保留，不迁移）】
//   profile/baseProfile + 派生(derived)、activeEvents、workflow*、agentStates、
//   chat*、toolCalls、proactive*(设置/调度/通知)、wealthTasks/plan、financial*
//   (导入/洞察/持仓)、investment*/finance*(行情/市场/新闻)、monitoring 进度等。
//   这些属于客户端交互态与本地派生计算，继续由本 store 持有。
//
// 【LEGACY 数据通道（待迁移，保留旧 Next /api/* 路由，待后端提供等价能力）】
//   loadUserProfile(/api/profile) · loadFinancialData(/api/financial-data)
//   importData/refreshData(/api/financial-data) · runWorkflow/runChat(SSE)
//   runMonitor/runProactiveMonitor/loadProactive*(SSE+proactive) · finance 行情
//   (/api/finance*) · loadInvestmentData(/api/market) · 文档中心(/api/documents)
//   · 知识中心(/api/knowledge*) · AI 记忆(/api/memory) · plan/review/copilot(SSE)
//   原因：后端 FastAPI 尚未 1:1 提供这些能力，或后端是独立数据孤岛、数据结构
//   与 .data 本地存储不一致，强行切换会显示空/不一致数据，违反「不破坏现有功能」。
//
// 【已迁移到 backendApi / React Query 的能力（见 src/hooks/use-backend.ts）】
//   本 store 暂未直接迁移 action；页面级追加接入见 agents/twin 等页：
//   - backendApi.agent.run/list + useAgentTasks（agents 页追加面板）
//   - backendApi.twin.status + useTwinStatus（twin 页追加「后端 Twin 引擎」卡）
//   - backendApi.twin.recalculate + useRecalculateTwin（twin 页后端重算按钮）
//   注：后端 twin/assets/monitor/documents 为独立数据孤岛，仅作追加展示/触发，
//   不覆盖本 store 的权威 UI 数据，避免双写与数据分叉。
// ════════════════════════════════════════════════════════════════════════════

// ── Store State ──────────────────────────────────────────────────────────────

interface FinancialState {
  // Core profile (with events applied)
  profile: FinancialProfile;
  baseProfile: FinancialProfile;

  // Derived
  cashFlow: CashFlow;
  riskMetrics: RiskMetrics;
  projection: ProjectionPoint[];
  baselineProjection: ProjectionPoint[];
  assetAllocation: AssetClass[];
  monthlyTrend: MonthlyTrend[];
  netWorth: number;
  projectedRetireAge: number;

  // Active scenarios
  activeEvents: string[];

  // Workflow
  workflowPhase: WorkflowPhase;
  workflowTasks: AITask[];
  agentStates: AgentResult[];
  workflowResults: AgentAnalysis[];
  workflowSummary?: AgentAnalysis;
  isWorkflowRunning: boolean;
  recognizedGoal?: string;
  workflowGoalLabel?: string;
  // Phase 3.4 Tool Calling：工具调用记录（AI Tool Trace）
  toolCalls: ToolCallRecord[];

  // Phase 3.5：当前用户与 Twin 状态
  currentUserId: string;
  // Phase 5.6：画像加载状态（用于新用户空状态判断）
  profileStatus: "unknown" | "loading" | "loaded" | "empty";
  // Phase 5.6：最近一次财富数据同步时间（毫秒时间戳），用于「数据更新时间」展示
  lastSyncedAt: number | null;
  twinSnapshot: TwinSnapshot | null;
  wealthHealthScore: WealthHealthScore | null;
  advisorAlerts: AdvisorAlert[];
  lifeStage: string;

  // Phase 4：Autonomous AI Wealth Manager
  monitoring: MonitoringResult | null;
  goalProgress: GoalProgress[];
  isMonitoring: boolean;
  // Phase 6.5：最近一次 AI 分析时间（来自缓存，Dashboard 打开时展示「最近结果」，不触发 LLM）
  lastAnalysisAt: number | null;

  // Phase 6.8：Proactive AI CFO 主动财富管家
  proactiveResult: ProactiveResult | null;
  proactiveDailyBrief: DailyBrief | null;
  proactiveNotifications: ProactiveNotification[];
  proactiveUnread: number;
  proactiveSettings: ProactiveSettings | null;
  proactiveSchedule: ScheduleStatus | null;
  isProactiveRunning: boolean;

  // Phase 5：AI Wealth Execution Engine
  wealthTasks: WealthTask[];
  wealthPlan: WealthPlan | null;
  actionPlan: ActionPlanJSON | null;
  reviewReport: ReviewReport | null;
  isPlanning: boolean;

  // Phase 6：Real Financial Data OS
  financialSummary: FinancialDataSummary | null;
  financialInsights: FinancialInsight[];
  recentTransactions: NormalizedTransaction[];
  dataHoldings: AssetHolding[];
  isImportingData: boolean;
  isLoadingInsights: boolean;
  lastImportResult: { ok: boolean; error?: string; batch?: ImportBatch; meta?: DatasetMeta } | null;

  // Phase 6.4：投资中心（Investment Twin：组合 + 收益 + 风险 + 市场状态）
  investmentTwin: InvestmentTwin | null;
  isLoadingInvestment: boolean;
  investmentLoadedFor: string | null;

  // Phase 6.9：Real Financial Data Integration + AI Investment Intelligence
  financeSources: PublicFinanceSource[];
  financePresets: FinanceProviderPreset[];
  portfolioView: PortfolioView | null;
  portfolioAnalysis: PortfolioAnalysis | null;
  portfolioHistory: PortfolioValuePoint[];
  marketOverview: MarketOverview | null;
  financeNews: Array<FinanceNewsItem & { related?: boolean; relatedHolding?: string }>;
  financeNewsNotice: string | null;
  investmentIntelligence: InvestmentIntelligenceResult | null;
  isLoadingPortfolio: boolean;
  isAnalyzingInvestment: boolean;

  // Chat
  chatHistory: ChatMessage[];
  // Phase 5.9.6：Intent Router 直达回复（greeting / model_info / general_question / profile_update 提示）
  lastDirectReply: { intent: ChatIntent; content: string } | null;

  // Actions
  applyEvent: (eventId: string) => void;
  removeEvent: (eventId: string) => void;
  toggleEvent: (eventId: string) => void;
  resetScenario: () => void;
  updateProfile: (updates: Partial<FinancialProfile>) => void;
  setGoal: (goal: Partial<FinancialProfile["goal"]>) => void;
  runWorkflow: (question: string) => Promise<void>;
  runChat: (question: string) => Promise<void>;
  resetWorkflow: () => void;
  addChatMessage: (msg: ChatMessage) => void;
  updateChatMessage: (id: string, updates: Partial<ChatMessage>) => void;
  // Phase 3.5：加载指定用户画像 + Twin 快照
  loadUserProfile: (userId: string, force?: boolean) => Promise<void>;
  // Phase 5.6：设置当前登录用户 id（由 auth 驱动）
  setCurrentUserId: (userId: string) => void;
  // Phase 5.7：数据管理 —— 清除财富数据（删除画像文件，回到空状态）
  clearProfileData: () => Promise<void>;
  // Phase 4：运行 AI CFO 主动体检（监控 / 检测 / 提醒 / 建议）
  runMonitor: (opts?: {
    runAgents?: boolean;
    profileOverride?: FinancialProfile;
  }) => Promise<void>;
  // Phase 6.5：加载最近一次 AI 分析结果时间（读取缓存，0 次 LLM）
  loadLatestAnalysis: (userId: string) => Promise<void>;
  // Phase 6.8：Proactive AI CFO 主动财富管家
  runProactiveMonitor: () => Promise<void>;
  loadProactiveNotifications: () => Promise<void>;
  loadProactiveSettings: () => Promise<void>;
  saveProactiveSettings: (patch: Partial<ProactiveSettings>) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  markNotification: (
    id: string,
    patch: { read?: boolean; dismissed?: boolean }
  ) => Promise<void>;
  loadProactiveSchedule: () => Promise<void>;
  // Phase 6.9：金融数据源 + 投资组合 + 市场 + 新闻 + AI 投资分析
  loadFinanceSources: () => Promise<void>;
  addFinanceSource: (input: FinanceSourceInput) => Promise<{ ok: boolean; error?: string }>;
  updateFinanceSource: (
    id: string,
    input: Partial<FinanceSourceInput>
  ) => Promise<{ ok: boolean; error?: string }>;
  deleteFinanceSource: (id: string) => Promise<void>;
  setDefaultFinanceSource: (id: string) => Promise<void>;
  testFinanceSource: (id: string) => Promise<{ ok: boolean; error?: string; latencyMs?: number }>;
  loadPortfolio: () => Promise<void>;
  loadMarketOverview: () => Promise<void>;
  loadFinanceNews: () => Promise<void>;
  runInvestmentAnalysis: (wantAI?: boolean) => Promise<void>;
  // Phase 5：财富执行引擎
  runPlan: (
    goalType?: string,
    opts?: { runAgents?: boolean; goalLabel?: string }
  ) => Promise<void>;
  loadTasks: (userId: string) => Promise<void>;
  completeTask: (taskId: string) => Promise<void>;
  runReview: (type: ReviewType) => Promise<void>;
  runCopilot: (
    message: string,
    opts?: { createTasks?: boolean }
  ) => Promise<void>;
  // Phase 6：Real Financial Data OS
  loadFinancialData: (userId?: string) => Promise<void>;
  importData: (input: {
    source: ImportSource;
    fileName: string;
    content: string;
    encoding: "utf8" | "base64";
  }) => Promise<boolean>;
  runDataInsight: () => Promise<void>;
  refreshData: () => Promise<void>;
  // Phase 6.4：加载投资中心数据（Investment Twin），force=true 强制刷新
  loadInvestmentData: (force?: boolean) => Promise<void>;
}

// ── Initial computation ──────────────────────────────────────────────────────

function deriveState(profile: FinancialProfile, base: FinancialProfile) {
  const cashFlow = computeCashFlow(profile);
  const riskMetrics = computeRiskMetrics(profile);
  const projection = computeProjection(profile);
  const baselineProjection = computeProjection(base);
  const assetAllocation = buildAssetAllocation(profile);
  const totalAssets =
    profile.cashSavings +
    profile.stockPortfolio +
    profile.realEstate +
    profile.bonds +
    profile.crypto +
    profile.funds +
    profile.house +
    profile.insurance;
  const netWorth = totalAssets - profile.liabilities;
  const projectedRetireAge = computeProjectedRetireAge(profile, projection);

  return {
    profile: { ...profile, totalAssets },
    cashFlow,
    riskMetrics,
    projection,
    baselineProjection,
    assetAllocation,
    // Phase 6.3 #217：月度趋势从画像派生（无 Demo 硬编码）；
    // 有真实流水时由 loadFinancialData 用 monthlyCashFlow 覆盖。
    monthlyTrend: deriveMonthlyTrend(profile),
    netWorth,
    projectedRetireAge,
  };
}

/** Phase 6.3 #221：真实流水 → 月度趋势（真实数据优先于画像派生值）。 */
function trendFromSummary(summary: FinancialDataSummary): MonthlyTrend[] {
  if (!summary.hasData || summary.monthlyCashFlow.length === 0) return [];
  return summary.monthlyCashFlow.slice(-6).map((m) => ({
    month: /^\d{4}-\d{2}$/.test(m.month) ? `${Number(m.month.slice(5))}月` : m.month,
    income: m.income,
    expenses: m.expense,
  }));
}

const initialAgentStates: AgentResult[] = [
  { agent: "planner", status: "idle", summary: "" },
  { agent: "cashflow", status: "idle", summary: "" },
  { agent: "investment", status: "idle", summary: "" },
  { agent: "risk", status: "idle", summary: "" },
  { agent: "retirement", status: "idle", summary: "" },
  { agent: "strategy", status: "idle", summary: "" },
  { agent: "summary", status: "idle", summary: "" },
];

// ── Store ────────────────────────────────────────────────────────────────────

export const useFinancialStore = create<FinancialState>((set, get) => {
  const initial = deriveState(baseProfile, baseProfile);

  // ── 服务端工作流事件 → 本地状态映射（Store 不执行任何 AI） ──
  const applyWorkflowEvent = (event: WorkflowEvent) => {
    switch (event.type) {
      case "phase":
        set({ workflowPhase: event.phase });
        // 规划阶段：财富规划 Agent 处于运行中
        if (event.phase === "recognizing-goal" || event.phase === "planning") {
          set((s) => ({
            agentStates: s.agentStates.map((a) =>
              a.agent === "planner"
                ? { ...a, status: "thinking" as const, summary: "识别目标并拆解任务" }
                : a
            ),
          }));
        }
        break;
      case "goal":
        set({
          recognizedGoal: event.goal.type,
          workflowGoalLabel: event.goal.label,
        });
        break;
      case "tasks":
        // 规划完成：财富规划 Agent 置为已完成
        set((s) => ({
          workflowTasks: event.tasks,
          agentStates: s.agentStates.map((a) =>
            a.agent === "planner"
              ? { ...a, status: "done" as const, summary: "已完成目标识别与任务规划" }
              : a
          ),
        }));
        break;
      case "task-start": {
        const agentKey = event.task.assignedAgent as AgentKey;
        set((s) => ({
          agentStates: s.agentStates.map((a) =>
            a.agent === agentKey
              ? { ...a, status: "thinking" as const, summary: event.task.description }
              : a
          ),
        }));
        break;
      }
      case "task-complete": {
        const agentKey = event.task.assignedAgent as AgentKey;
        const result = event.result;
        set((s) => ({
          agentStates: s.agentStates.map((a) =>
            a.agent === agentKey
              ? {
                  ...a,
                  status: "done" as const,
                  summary: result.headline,
                  data: result,
                }
              : a
          ),
          workflowResults: [
            ...s.workflowResults,
            {
              agent: agentKey,
              headline: result.headline,
              bullets: result.bullets,
              metrics: result.metrics,
              confidence: result.confidence,
              sources: result.sources,
            } as AgentAnalysis,
          ],
        }));
        break;
      }
      case "summary":
        set({
          workflowSummary: {
            agent: "summary",
            headline: event.summary.headline,
            bullets: event.summary.bullets,
            metrics: event.summary.metrics,
            confidence: event.summary.confidence,
            sources: event.summary.sources,
          } as AgentAnalysis,
        });
        break;
      case "tool-calls":
        // Phase 3.4：累积工具调用记录（AI Tool Trace）
        set((s) => ({ toolCalls: [...s.toolCalls, ...event.records] }));
        break;
      case "twin-update": {
        // Phase 3.5：Twin 财富路径重算（人生事件模拟）
        const s = event.snapshot;
        set((prev) => ({
          projection: s.projection,
          baselineProjection: s.baselineProjection,
          netWorth: s.netWorth,
          profile: { ...prev.profile, totalAssets: s.totalAssets },
          projectedRetireAge: s.projectedRetireAge,
          activeEvents: s.activeEvents,
          twinSnapshot: s,
          wealthHealthScore: s.health,
          lifeStage: s.lifeStage,
        }));
        break;
      }
      case "done":
        set((s) => ({
          workflowPhase: event.state.phase,
          isWorkflowRunning: false,
          agentStates: s.agentStates.map((a) =>
            a.status === "thinking" ? { ...a, status: "idle" as const } : a
          ),
        }));
        break;
      case "direct-reply":
        // Phase 5.9.6：Intent Router 直达回复，不进入财富分析工作流。
        set({ lastDirectReply: { intent: event.intent, content: event.content } });
        break;
      case "error":
        console.error("Workflow error:", event.message);
        set((s) => ({
          isWorkflowRunning: false,
          agentStates: s.agentStates.map((a) =>
            a.status === "thinking" ? { ...a, status: "idle" as const } : a
          ),
        }));
        break;
    }
  };

  const runServerWorkflow = async (generator: AsyncGenerator<WorkflowEvent>) => {
    const state = get();
    if (state.isWorkflowRunning) return;

    set({
      isWorkflowRunning: true,
      workflowPhase: "recognizing-goal",
      workflowTasks: [],
      workflowResults: [],
      workflowSummary: undefined,
      recognizedGoal: undefined,
      workflowGoalLabel: undefined,
      agentStates: initialAgentStates.map((s) => ({ ...s })),
      toolCalls: [],
      lastDirectReply: null,
    });

    try {
      for await (const event of generator) {
        applyWorkflowEvent(event);
      }
    } catch (err) {
      console.error("Workflow error:", err);
      set((s) => ({
        workflowPhase: "idle",
        isWorkflowRunning: false,
        agentStates: s.agentStates.map((a) =>
          a.status === "thinking" ? { ...a, status: "idle" as const } : a
        ),
      }));
    }
  };

  return {
    profile: initial.profile,
    baseProfile,
    cashFlow: initial.cashFlow,
    riskMetrics: initial.riskMetrics,
    projection: initial.projection,
    baselineProjection: initial.baselineProjection,
    assetAllocation: initial.assetAllocation,
    monthlyTrend: initial.monthlyTrend,
    netWorth: initial.netWorth,
    projectedRetireAge: initial.projectedRetireAge,

    activeEvents: [],

    workflowPhase: "idle",
    workflowTasks: [],
    agentStates: initialAgentStates,
    workflowResults: [],
    workflowSummary: undefined,
    isWorkflowRunning: false,
    toolCalls: [],

    // Phase 3.5 初始用户与 Twin 状态
    currentUserId: "",
    profileStatus: "unknown",
    lastSyncedAt: null,
    twinSnapshot: null,
    wealthHealthScore: null,
    advisorAlerts: [],
    lifeStage: "",

    // Phase 4：Autonomous AI Wealth Manager 初始状态
    monitoring: null,
    goalProgress: [],
    isMonitoring: false,
    lastAnalysisAt: null,

    // Phase 6.8：Proactive AI CFO 主动财富管家 初始状态
    proactiveResult: null,
    proactiveDailyBrief: null,
    proactiveNotifications: [],
    proactiveUnread: 0,
    proactiveSettings: null,
    proactiveSchedule: null,
    isProactiveRunning: false,

    // Phase 5：AI Wealth Execution Engine 初始状态
    wealthTasks: [],
    wealthPlan: null,
    actionPlan: null,
    reviewReport: null,
    isPlanning: false,

    // Phase 6：Real Financial Data OS 初始状态
    financialSummary: null,
    financialInsights: [],
    recentTransactions: [],
    dataHoldings: [],
    isImportingData: false,
    isLoadingInsights: false,
    lastImportResult: null,

    // Phase 6.4：投资中心初始状态
    investmentTwin: null,
    isLoadingInvestment: false,
    investmentLoadedFor: null,

    // Phase 6.9：真实金融数据 + 投资智能 初始状态
    financeSources: [],
    financePresets: [],
    portfolioView: null,
    portfolioAnalysis: null,
    portfolioHistory: [],
    marketOverview: null,
    financeNews: [],
    financeNewsNotice: null,
    investmentIntelligence: null,
    isLoadingPortfolio: false,
    isAnalyzingInvestment: false,

    chatHistory: [],
    lastDirectReply: null,

    applyEvent: (eventId: string) => {
      const { baseProfile, activeEvents } = get();
      if (activeEvents.includes(eventId)) return;
      const newEvents = [...activeEvents, eventId];
      const newProfile = recomputeProfile(baseProfile, newEvents);
      const derived = deriveState(newProfile, baseProfile);
      set({
        activeEvents: newEvents,
        ...derived,
      });
    },

    removeEvent: (eventId: string) => {
      const { baseProfile, activeEvents } = get();
      const newEvents = activeEvents.filter((id) => id !== eventId);
      const newProfile = recomputeProfile(baseProfile, newEvents);
      const derived = deriveState(newProfile, baseProfile);
      set({
        activeEvents: newEvents,
        ...derived,
      });
    },

    toggleEvent: (eventId: string) => {
      const { activeEvents } = get();
      if (activeEvents.includes(eventId)) {
        get().removeEvent(eventId);
      } else {
        get().applyEvent(eventId);
      }
    },

    resetScenario: () => {
      const { baseProfile } = get();
      const derived = deriveState(baseProfile, baseProfile);
      set({
        activeEvents: [],
        ...derived,
      });
    },

    updateProfile: (updates: Partial<FinancialProfile>) => {
      const { baseProfile, activeEvents } = get();
      // For direct profile updates, update base and re-apply events
      const newBase = { ...baseProfile, ...updates, modifiers: { ...baseProfile.modifiers } };
      const newProfile = recomputeProfile(newBase, activeEvents);
      const derived = deriveState(newProfile, newBase);
      set({
        baseProfile: newBase,
        ...derived,
      });
    },

    setGoal: (goal: Partial<FinancialProfile["goal"]>) => {
      get().updateProfile({
        goal: { ...get().profile.goal, ...goal },
      });
    },

    setCurrentUserId: (userId: string) => set({ currentUserId: userId }),

    clearProfileData: async () => {
      try {
        await fetch(`/api/profile`, { method: "DELETE" });
      } catch {
        /* 忽略网络错误，仍本地重置为空状态 */
      }
      set({
        profileStatus: "empty",
        twinSnapshot: null,
        wealthHealthScore: null,
        advisorAlerts: [],
        lastAnalysisAt: null,
      });
    },

    loadUserProfile: async (userId: string, force = false) => {
      // Phase 5.9.1：页面切换去重——同一用户已加载真实画像时跳过重复网络请求与重算，
      // 使 Dashboard ↔ Twin ↔ Chat ↔ Report ↔ Agents 切换即时响应（无需重新拉取/重算）。
      // force=true 用于数据变更后的显式刷新（导入、重建 Twin、创建画像等）。
      const st = get();
      if (!force && st.currentUserId === userId && st.profileStatus === "loaded") {
        return;
      }
      set({ currentUserId: userId, profileStatus: "loading" });
      try {
        const res = await fetch(`/api/profile/${encodeURIComponent(userId)}`);
        // 404 / 200+空画像 = 新用户尚未创建画像 → 空状态（不产生控制台报错）
        if (res.status === 404) {
          set({ profileStatus: "empty" });
          return;
        }
        if (!res.ok) {
          set({ profileStatus: "unknown" });
          return;
        }
        const data = (await res.json()) as {
          exists?: boolean;
          profile: FinancialProfile | null;
          twin: TwinSnapshot;
          alerts: AdvisorAlert[];
        };
        // 已登录但无画像（exists:false / profile:null）→ 空状态
        if (!data.profile) {
          set({ profileStatus: "empty" });
          return;
        }
        const derived = deriveState(data.profile, data.profile);
        set({
          currentUserId: userId,
          profileStatus: "loaded",
          lastSyncedAt: Date.now(),
          baseProfile: data.profile,
          ...derived,
          twinSnapshot: data.twin ?? null,
          wealthHealthScore: data.twin?.health ?? null,
          advisorAlerts: data.alerts ?? [],
          lifeStage: data.twin?.lifeStage ?? "",
        });
        // Phase 5：进入时载入该用户的执行任务
        get().loadTasks(userId);
        // Phase 6.8：进入时载入主动管家通知 / 设置 / 调度状态（供 Header 铃铛与状态卡）
        get().loadProactiveNotifications();
        get().loadProactiveSettings();
        get().loadProactiveSchedule();
      } catch {
        /* 网络失败不影响现有 UI */
        set({ profileStatus: "unknown" });
      }
    },

    runMonitor: async (opts?: { runAgents?: boolean; profileOverride?: FinancialProfile }) => {
      // 纵深防御：未加载真实画像前禁止触发任何 AI 分析（空态不向服务端发请求）
      if (get().profileStatus !== "loaded") return;
      const { profile, baseProfile, currentUserId } = get();
      set({ isMonitoring: true });
      try {
        const res = await fetch(`/api/ai/monitor`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: currentUserId,
            profile: opts?.profileOverride ?? profile,
            prevProfile: baseProfile,
            runAgents: opts?.runAgents ?? false,
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          monitoring?: MonitoringResult;
          agents?: AgentAnalysis[];
        };
        if (data.monitoring) {
          set({
            monitoring: data.monitoring,
            goalProgress: data.monitoring.goalProgress,
            // Phase 6.5：主动体检完成即记录最近一次分析时间（用于 Dashboard 展示，不重复调 LLM）
            lastAnalysisAt: data.agents && data.agents.length > 0 ? Date.now() : get().lastAnalysisAt,
          });
        }
      } catch {
        /* 网络失败不影响现有 UI */
      } finally {
        set({ isMonitoring: false });
      }
    },

    loadLatestAnalysis: async (userId: string) => {
      if (!userId) return;
      try {
        const res = await fetch(`/api/ai/cache`);
        if (!res.ok) return;
        const data = (await res.json()) as { ok: boolean; analysis: { createdAt: number } | null };
        if (data.analysis) {
          set({ lastAnalysisAt: data.analysis.createdAt });
        } else {
          set({ lastAnalysisAt: null });
        }
      } catch {
        /* 读取失败不影响 UI */
      }
    },

    // ── Phase 6.8：Proactive AI CFO 主动财富管家 ────────────────────────
    runProactiveMonitor: async () => {
      // 纵深防御：未加载真实画像前禁止触发任何 AI 分析
      if (get().profileStatus !== "loaded") return;
      set({ isProactiveRunning: true });
      try {
        const res = await fetch(`/api/ai/proactive/run`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "manual" }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          result?: ProactiveResult;
          dailyBrief?: DailyBrief;
        };
        if (data.result) {
          set({
            proactiveResult: data.result,
            proactiveDailyBrief: data.dailyBrief ?? null,
          });
        }
        // 体检后刷新通知 / 未读 / 调度状态
        await get().loadProactiveNotifications();
        await get().loadProactiveSchedule();
      } catch {
        /* 网络失败不影响现有 UI */
      } finally {
        set({ isProactiveRunning: false });
      }
    },

    loadProactiveNotifications: async () => {
      if (!get().currentUserId) return;
      try {
        const res = await fetch(`/api/ai/proactive/notifications`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          notifications: ProactiveNotification[];
          unread: number;
        };
        set({
          proactiveNotifications: data.notifications,
          proactiveUnread: data.unread,
        });
      } catch {
        /* 忽略网络错误 */
      }
    },

    loadProactiveSettings: async () => {
      if (!get().currentUserId) return;
      try {
        const res = await fetch(`/api/ai/proactive/settings`);
        if (!res.ok) return;
        const data = (await res.json()) as { settings: ProactiveSettings };
        set({ proactiveSettings: data.settings });
      } catch {
        /* 忽略网络错误 */
      }
    },

    saveProactiveSettings: async (patch: Partial<ProactiveSettings>) => {
      try {
        const res = await fetch(`/api/ai/proactive/settings`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { settings: ProactiveSettings };
        set({ proactiveSettings: data.settings });
      } catch {
        /* 忽略网络错误 */
      }
    },

    markAllNotificationsRead: async () => {
      try {
        const res = await fetch(`/api/ai/proactive/notifications`, {
          method: "PATCH",
        });
        if (res.ok) {
          set((s) => ({
            proactiveNotifications: s.proactiveNotifications.map((n) => ({
              ...n,
              read: true,
            })),
            proactiveUnread: 0,
          }));
        }
      } catch {
        /* 忽略网络错误 */
      }
    },

    markNotification: async (id, patch) => {
      try {
        const res = await fetch(
          `/api/ai/proactive/notifications/${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          }
        );
        if (res.ok) {
          set((s) => {
            const notifications = s.proactiveNotifications.map((n) =>
              n.id === id ? { ...n, ...patch } : n
            );
            const unread = notifications.filter(
              (n) => !n.read && !n.dismissed
            ).length;
            return { proactiveNotifications: notifications, proactiveUnread: unread };
          });
        }
      } catch {
        /* 忽略网络错误 */
      }
    },

    loadProactiveSchedule: async () => {
      if (!get().currentUserId) return;
      try {
        const res = await fetch(`/api/ai/proactive/schedule`);
        if (!res.ok) return;
        const data = (await res.json()) as { status: ScheduleStatus };
        set({ proactiveSchedule: data.status });
      } catch {
        /* 忽略网络错误 */
      }
    },

    // ── Phase 6.9：真实金融数据 + AI 投资智能 ────────────────────────────
    loadFinanceSources: async () => {
      try {
        const res = await fetch(`/api/finance/sources`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          sources: PublicFinanceSource[];
          presets: FinanceProviderPreset[];
        };
        set({ financeSources: data.sources ?? [], financePresets: data.presets ?? [] });
      } catch {
        /* 忽略网络错误 */
      }
    },

    addFinanceSource: async (input) => {
      try {
        const res = await fetch(`/api/finance/sources`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const data = (await res.json()) as { source?: PublicFinanceSource; error?: string };
        if (!res.ok) return { ok: false, error: data.error ?? "添加失败" };
        await get().loadFinanceSources();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },

    updateFinanceSource: async (id, input) => {
      try {
        const res = await fetch(`/api/finance/sources/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) return { ok: false, error: data.error ?? "更新失败" };
        await get().loadFinanceSources();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },

    deleteFinanceSource: async (id) => {
      try {
        await fetch(`/api/finance/sources/${id}`, { method: "DELETE" });
        await get().loadFinanceSources();
      } catch {
        /* 忽略网络错误 */
      }
    },

    setDefaultFinanceSource: async (id) => {
      try {
        await fetch(`/api/finance/sources/${id}/default`, { method: "POST" });
        await get().loadFinanceSources();
      } catch {
        /* 忽略网络错误 */
      }
    },

    testFinanceSource: async (id) => {
      try {
        const res = await fetch(`/api/finance/sources/${id}/test`, { method: "POST" });
        const data = (await res.json()) as { ok?: boolean; error?: string; latencyMs?: number };
        await get().loadFinanceSources();
        return { ok: data.ok === true, error: data.error, latencyMs: data.latencyMs };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },

    loadPortfolio: async () => {
      if (!get().currentUserId) return;
      set({ isLoadingPortfolio: true });
      try {
        const res = await fetch(`/api/finance/portfolio`);
        if (res.ok) {
          const data = (await res.json()) as {
            portfolio: PortfolioView;
            analysis: PortfolioAnalysis | null;
            history: PortfolioValuePoint[];
          };
          set({
            portfolioView: data.portfolio,
            portfolioAnalysis: data.analysis,
            portfolioHistory: data.history ?? [],
          });
        }
      } catch {
        /* 忽略网络错误 */
      } finally {
        set({ isLoadingPortfolio: false });
      }
    },

    loadMarketOverview: async () => {
      if (!get().currentUserId) return;
      try {
        const res = await fetch(`/api/finance/market`);
        if (!res.ok) return;
        const data = (await res.json()) as { market: MarketOverview };
        set({ marketOverview: data.market });
      } catch {
        /* 忽略网络错误 */
      }
    },

    loadFinanceNews: async () => {
      if (!get().currentUserId) return;
      try {
        const res = await fetch(`/api/finance/news?limit=20`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          items: Array<FinanceNewsItem & { related?: boolean; relatedHolding?: string }>;
          dataNotice?: string;
        };
        set({
          financeNews: data.items ?? [],
          financeNewsNotice: data.dataNotice ?? null,
        });
        // 重大新闻可能触发了新提醒 → 刷新通知
        get().loadProactiveNotifications();
      } catch {
        /* 忽略网络错误 */
      }
    },

    runInvestmentAnalysis: async (wantAI = false) => {
      if (get().profileStatus !== "loaded") return;
      set({ isAnalyzingInvestment: true });
      try {
        const res = await fetch(`/api/finance/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wantAI }),
        });
        if (res.ok) {
          const data = (await res.json()) as { result: InvestmentIntelligenceResult };
          set({
            investmentIntelligence: data.result,
            portfolioView: data.result.portfolio,
            portfolioAnalysis: data.result.analysis,
            marketOverview: data.result.market,
          });
          // 风险提醒可能已写入通知中心
          get().loadProactiveNotifications();
        }
      } catch {
        /* 忽略网络错误 */
      } finally {
        set({ isAnalyzingInvestment: false });
      }
    },

    // ── Phase 5：AI Wealth Execution Engine ──────────────────────────────
    runPlan: async (goalType, opts) => {
      // 纵深防御：未加载真实画像前禁止触发财富计划生成
      if (get().profileStatus !== "loaded") return;
      const { profile, currentUserId } = get();
      set({ isPlanning: true });
      try {
        const res = await fetch(`/api/ai/plan`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: currentUserId,
            profile,
            goalType,
            goalLabel: opts?.goalLabel,
            runAgents: opts?.runAgents ?? false,
            createTasks: true,
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          result?: {
            tasks?: WealthTask[];
            plan?: WealthPlan;
            actionPlan?: ActionPlanJSON;
          };
        };
        if (data.result) {
          set({
            wealthTasks: data.result.tasks ?? [],
            wealthPlan: data.result.plan ?? null,
            actionPlan: data.result.actionPlan ?? null,
          });
        }
      } catch {
        /* 网络失败不影响现有 UI */
      } finally {
        set({ isPlanning: false });
      }
    },

    loadTasks: async (userId: string) => {
      try {
        const res = await fetch(
          `/api/wealth/tasks?userId=${encodeURIComponent(userId)}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as { tasks?: WealthTask[] };
        set({ wealthTasks: data.tasks ?? [] });
      } catch {
        /* 网络失败不影响现有 UI */
      }
    },

    completeTask: async (taskId: string) => {
      // 乐观更新本地状态
      set((s) => ({
        wealthTasks: s.wealthTasks.map((t) =>
          t.id === taskId ? { ...t, status: "done", completedAt: Date.now() } : t
        ),
      }));
      try {
        const { currentUserId } = get();
        const res = await fetch(`/api/wealth/tasks`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: currentUserId, id: taskId, status: "done" }),
        });
        if (res.ok) {
          const data = (await res.json()) as { task?: WealthTask };
          if (data.task) {
            set((s) => ({
              wealthTasks: s.wealthTasks.map((t) =>
                t.id === taskId ? data.task! : t
              ),
            }));
          }
        }
      } catch {
        /* 网络失败不影响现有 UI */
      }
    },

    runReview: async (type: ReviewType) => {
      // 纵深防御：未加载真实画像前禁止触发财富复盘
      if (get().profileStatus !== "loaded") return;
      const { profile, currentUserId } = get();
      try {
        const res = await fetch(`/api/ai/review`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: currentUserId, profile, type }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { report?: ReviewReport };
        if (data.report) set({ reviewReport: data.report });
      } catch {
        /* 网络失败不影响现有 UI */
      }
    },

    runCopilot: async (message: string, opts) => {
      // 纵深防御：未加载真实画像前禁止触发副驾驶（用户主动触发时才有 profile）
      if (get().profileStatus !== "loaded") return;
      const { profile, currentUserId } = get();
      try {
        const res = await fetch(`/api/ai/copilot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: currentUserId,
            profile,
            message,
            createTasks: opts?.createTasks ?? false,
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          result?: {
            tasks?: WealthTask[];
            plan?: WealthPlan;
            actionPlan?: ActionPlanJSON;
          };
        };
        if (data.result) {
          set({
            wealthTasks:
              data.result.tasks && data.result.tasks.length > 0
                ? data.result.tasks
                : get().wealthTasks,
            wealthPlan: data.result.plan ?? get().wealthPlan,
            actionPlan: data.result.actionPlan ?? get().actionPlan,
          });
        }
      } catch {
        /* 网络失败不影响现有 UI */
      }
    },

    runWorkflow: async (question: string, opts?: { lifeEventId?: string }) => {
      // 纵深防御：未加载真实画像前禁止触发工作流分析
      if (get().profileStatus !== "loaded") return;
      await runServerWorkflow(
        runWorkflowSSE({
          question,
          profile: get().profile,
          activeEvents: get().activeEvents,
          userId: get().currentUserId,
          lifeEventId: opts?.lifeEventId,
        })
      );
    },

    runChat: async (question: string, opts?: { lifeEventId?: string }) => {
      // 纵深防御：未加载真实画像前禁止触发 AI CFO 对话分析
      if (get().profileStatus !== "loaded") return;
      await runServerWorkflow(
        runChatSSE({
          messages: [{ role: "user", content: question }],
          profile: get().profile,
          activeEvents: get().activeEvents,
          userId: get().currentUserId,
          lifeEventId: opts?.lifeEventId,
        })
      );
    },

    resetWorkflow: () => {
      set({
        workflowPhase: "idle",
        workflowTasks: [],
        agentStates: initialAgentStates.map((s) => ({ ...s })),
        workflowResults: [],
        workflowSummary: undefined,
        isWorkflowRunning: false,
        toolCalls: [],
      });
    },

    addChatMessage: (msg: ChatMessage) => {
      set((s) => ({ chatHistory: [...s.chatHistory, msg] }));
    },

    updateChatMessage: (id: string, updates: Partial<ChatMessage>) => {
      set((s) => ({
        chatHistory: s.chatHistory.map((m) =>
          m.id === id ? { ...m, ...updates } : m
        ),
      }));
    },

    // ── Phase 6：Real Financial Data OS ──────────────────────────────────

    loadFinancialData: async (userId?: string) => {
      const uid = userId ?? get().currentUserId;
      try {
        const res = await fetch(
          `/api/financial-data/summary?userId=${encodeURIComponent(uid)}&transactions=1`
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          ok: boolean;
          summary?: FinancialDataSummary;
          transactions?: NormalizedTransaction[];
          holdings?: AssetHolding[];
        };
        if (!data.ok || !data.summary) return;
        // Phase 6.3 #221：有真实流水时，月度趋势切换为真实数据源
        const realTrend = trendFromSummary(data.summary);
        set((s) => ({
          financialSummary: data.summary ?? null,
          recentTransactions: data.transactions ?? [],
          dataHoldings: data.holdings ?? [],
          lastSyncedAt: Date.now(),
          monthlyTrend: realTrend.length > 0 ? realTrend : s.monthlyTrend,
        }));
      } catch {
        /* 网络失败不影响现有 UI */
      }
    },

    importData: async (input) => {
      set({ isImportingData: true, lastImportResult: null });
      try {
        const { currentUserId } = get();
        const res = await fetch(`/api/financial-data/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: currentUserId, ...input }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          error?: string;
          batch?: ImportBatch;
          meta?: DatasetMeta;
          summary?: FinancialDataSummary;
        };
        set({
          lastImportResult: {
            ok: data.ok,
            error: data.error,
            batch: data.batch,
            meta: data.meta,
          },
        });
        if (data.ok) {
          // 导入成功：刷新数据摘要 + 用户画像（Twin 已在服务端重建）
          await get().loadFinancialData();
          await get().loadUserProfile(currentUserId, true);
        }
        return data.ok;
      } catch (err) {
        set({
          lastImportResult: { ok: false, error: (err as Error).message },
        });
        return false;
      } finally {
        set({ isImportingData: false });
      }
    },

    runDataInsight: async () => {
      set({ isLoadingInsights: true });
      try {
        const { currentUserId } = get();
        const res = await fetch(`/api/financial-data/insight`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: currentUserId }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          ok: boolean;
          insights?: FinancialInsight[];
        };
        if (data.ok) {
          set({ financialInsights: data.insights ?? [] });
        }
      } catch {
        /* ignore */
      } finally {
        set({ isLoadingInsights: false });
      }
    },

    // ── Phase 6.4：投资中心（Investment Twin） ─────────────────────────────
    loadInvestmentData: async (force = false) => {
      const st = get();
      const uid = st.currentUserId;
      // 页面切换去重：同一用户已加载且非强制刷新时跳过
      if (!force && st.investmentTwin && st.investmentLoadedFor === uid) return;
      if (st.isLoadingInvestment) return;
      set({ isLoadingInvestment: true });
      try {
        const res = await fetch(`/api/market/snapshot`);
        if (!res.ok) return;
        const data = (await res.json()) as { ok: boolean; twin?: InvestmentTwin };
        if (data.ok && data.twin) {
          set({ investmentTwin: data.twin, investmentLoadedFor: uid });
        }
      } catch {
        /* 网络失败不影响现有 UI：投资中心显示等待连接状态 */
      } finally {
        set({ isLoadingInvestment: false });
      }
    },

    refreshData: async () => {
      try {
        const { currentUserId } = get();
        const res = await fetch(`/api/financial-data/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: currentUserId }),
        });
        if (!res.ok) return;
        await get().loadFinancialData();
        await get().loadUserProfile(currentUserId);
      } catch {
        /* ignore */
      }
    },
  };
});

// Selectors for common data shapes
export function useFinancialProfile() {
  return useFinancialStore((s) => ({
    profile: s.profile,
    baseProfile: s.baseProfile,
    cashFlow: s.cashFlow,
    riskMetrics: s.riskMetrics,
    projection: s.projection,
    baselineProjection: s.baselineProjection,
    assetAllocation: s.assetAllocation,
    monthlyTrend: s.monthlyTrend,
    netWorth: s.netWorth,
    projectedRetireAge: s.projectedRetireAge,
    activeEvents: s.activeEvents,
    scenarios,
  }));
}
