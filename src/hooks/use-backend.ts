"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from "@tanstack/react-query";
import { backendApi, backendApiAutonomous } from "@/lib/backend-client";
import type {
  AutoOverview,
  AutoInsights,
  AutoCost,
  AutoEvent,
  AutomationRun,
  AutomationRule,
  AutomationSchedule,
  AutomationWorkflow,
  AutomationWebhook,
  AutomationAction,
  AutomationPlan,
  ActionStats,
  ActionStatus,
  BootstrapResult,
  ScanResult,
  PreferenceProfile,
  PreferenceBias,
  WorkflowTemplate,
  MarketPrice,
  PortfolioChange,
} from "@/types/autonomous";

/**
 * 是否已持有后端鉴权 token（Phase 7.0.4 #306）。
 *
 * 实现统一收口到 backend-client.ts，此处仅做再导出，避免两份逻辑分叉。
 * SSR 下 window 不存在时直接返回 false，配合 React Query 的 enabled 守卫，
 * 避免服务端/未登录态发起无效请求。
 */
import { hasBackendToken } from "@/lib/backend-client";
export { hasBackendToken };

export function useTwinStatus(): UseQueryResult<unknown> {
  return useQuery({
    queryKey: ["twin", "status"],
    queryFn: () => backendApi.twin.status(),
    enabled: hasBackendToken(),
  });
}

export function useAssets(): UseQueryResult<unknown> {
  return useQuery({
    queryKey: ["assets"],
    queryFn: () => backendApi.assets.list(),
    enabled: hasBackendToken(),
  });
}

export function useAgentTasks(): UseQueryResult<unknown> {
  return useQuery({
    queryKey: ["agent", "tasks"],
    queryFn: () => backendApi.agent.list(),
    enabled: hasBackendToken(),
  });
}

export function useRagChunks(): UseQueryResult<unknown> {
  return useQuery({
    queryKey: ["rag", "chunks"],
    queryFn: () => backendApi.rag.chunks(),
    enabled: hasBackendToken(),
  });
}

export function useCreateAsset(): UseMutationResult<unknown, unknown, unknown> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => backendApi.assets.create(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["twin"] });
    },
  });
}

export function useUpdateAsset(): UseMutationResult<
  unknown,
  unknown,
  { id: string; body: unknown }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => backendApi.assets.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["twin"] });
    },
  });
}

export function useDeleteAsset(): UseMutationResult<
  unknown,
  unknown,
  { id: string }
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => backendApi.assets.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["twin"] });
    },
  });
}

export function useRecalculateTwin(): UseMutationResult<unknown, unknown, void> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => backendApi.twin.recalculate(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["twin"] });
    },
  });
}

/* ---------------- Phase 7.1 Wealth Intelligence（财富实验室） ---------------- */

export interface WealthPredictParams {
  retirementAge?: number;
  goalAmount?: number | null;
  goalYears?: number | null;
  refresh?: boolean;
}

export function useWealthPredict(params: WealthPredictParams) {
  return useQuery({
    queryKey: ["intelligence", "predict", params],
    queryFn: () =>
      backendApi.intelligence.predict({
        retirementAge: params.retirementAge ?? 60,
        goalAmount: params.goalAmount ?? undefined,
        goalYears: params.goalYears ?? undefined,
        refresh: params.refresh ?? false,
      }),
    enabled: hasBackendToken(),
  });
}

export function useWealthScore(persist = false) {
  return useQuery({
    queryKey: ["intelligence", "score", persist],
    queryFn: () => backendApi.intelligence.score(persist),
    enabled: hasBackendToken(),
  });
}

export function useWealthEvents() {
  return useQuery({
    queryKey: ["intelligence", "events"],
    queryFn: () => backendApi.intelligence.events(),
    enabled: hasBackendToken(),
  });
}

export function useWealthOverview() {
  return useQuery({
    queryKey: ["intelligence", "overview"],
    queryFn: () => backendApi.intelligence.overview(),
    enabled: hasBackendToken(),
  });
}

export function useSimulate(): UseMutationResult<unknown, unknown, unknown> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => backendApi.intelligence.simulate(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intelligence"] });
    },
  });
}

export function useComparePlans(): UseMutationResult<unknown, unknown, unknown> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => backendApi.intelligence.compare(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intelligence"] });
    },
  });
}

export function useWealthWorkflow(): UseMutationResult<unknown, unknown, unknown> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => backendApi.intelligence.workflow(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intelligence"] });
    },
  });
}

export function useWealthStrategy(): UseMutationResult<unknown, unknown, unknown> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => backendApi.intelligence.strategy(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["intelligence"] });
    },
  });
}

/* ---------------- Phase 7.2 Multimodal Intelligence（多模态识别录入） ---------------- */

export function useMultimodalCapabilities() {
  return useQuery({
    queryKey: ["multimodal", "capabilities"],
    queryFn: () => backendApi.multimodal.capabilities(),
    enabled: hasBackendToken(),
  });
}

export function useMultimodalPending() {
  return useQuery({
    queryKey: ["multimodal", "pending"],
    queryFn: () => backendApi.multimodal.pending(),
    enabled: hasBackendToken(),
  });
}

export function useMultimodalInputs(limit = 20) {
  return useQuery({
    queryKey: ["multimodal", "inputs", limit],
    queryFn: () => backendApi.multimodal.inputs(limit),
    enabled: hasBackendToken(),
  });
}

export function useMultimodalIngestText() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { text: string; useAi?: boolean }) =>
      backendApi.multimodal.ingestText(body.text, body.useAi ?? true),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["multimodal"] });
    },
  });
}

export function useMultimodalUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { file: File; modality?: string; useAi?: boolean }) =>
      backendApi.multimodal.upload(body.file, body.modality, body.useAi ?? true),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["multimodal"] });
    },
  });
}

export function useMultimodalSpeech() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { transcript: string; useAi?: boolean; autoIngest?: boolean }) =>
      backendApi.multimodal.speech(body.transcript, body.useAi ?? true, body.autoIngest ?? true),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["multimodal"] });
    },
  });
}

export function useMultimodalConfirm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { ids: string[]; edits?: Record<string, unknown> }) =>
      backendApi.multimodal.confirm(body.ids, body.edits),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["multimodal"] });
      qc.invalidateQueries({ queryKey: ["twin"] });
      qc.invalidateQueries({ queryKey: ["financial"] });
    },
  });
}

export function useMultimodalReject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => backendApi.multimodal.reject(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["multimodal"] });
    },
  });
}

export function useMultimodalDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backendApi.multimodal.deleteInput(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["multimodal"] });
    },
  });
}

/* ---------------- Phase 7.2 Agent Ecosystem（智能体生态） ---------------- */

export function useAgentsMarket() {
  return useQuery({
    queryKey: ["agents", "market"],
    queryFn: () => backendApi.agents.market(),
    enabled: hasBackendToken(),
  });
}

export function useAgentsTools() {
  return useQuery({
    queryKey: ["agents", "tools"],
    queryFn: () => backendApi.agents.tools(),
    enabled: hasBackendToken(),
  });
}

export function useAgentsRuns() {
  return useQuery({
    queryKey: ["agents", "runs"],
    queryFn: () => backendApi.agents.runs(),
    enabled: hasBackendToken(),
  });
}

export function useConfigureAgents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; payload: unknown }) =>
      backendApi.agents.configure(body.name, body.payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents", "market"] });
    },
  });
}

export function useRunSingle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; question?: string; useAi?: boolean }) =>
      backendApi.agents.run(body.name, body.question, body.useAi ?? true),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents", "runs"] });
    },
  });
}

export function useRunWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      question?: string;
      agents?: string[];
      useAi?: boolean;
      persist?: boolean;
    }) => backendApi.agents.workflow(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agents", "runs"] });
    },
  });
}

export function useCallTool() {
  return useMutation({
    mutationFn: (body: { tool: string; params: Record<string, unknown> }) =>
      backendApi.agents.callTool(body.tool, body.params),
  });
}

/* ---------------- Phase 7.2 Wealth Report（财富报告） ---------------- */

export function useReportKinds() {
  return useQuery({
    queryKey: ["report", "kinds"],
    queryFn: () => backendApi.report.kinds(),
    enabled: hasBackendToken(),
  });
}

export function useReportList() {
  return useQuery({
    queryKey: ["report", "list"],
    queryFn: () => backendApi.report.list(),
    enabled: hasBackendToken(),
  });
}

export function useReportGenerate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { kind: string; useAi?: boolean; persist?: boolean }) =>
      backendApi.report.generate(body.kind, body.useAi ?? true, body.persist ?? true),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report"] });
    },
  });
}

export function useReportDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backendApi.report.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report"] });
    },
  });
}

/* ---------------- Phase 7.3 Personal OS ---------------- */

export function useAvatar() {
  return useQuery({
    queryKey: ["personalOs", "avatar"],
    queryFn: () => backendApi.personalOs.avatar<import("@/types/personal_os").WealthAvatarData>(),
    enabled: hasBackendToken(),
  });
}

export function useRenameAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (avatarName: string) => backendApi.personalOs.renameAvatar(avatarName),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personalOs", "avatar"] }),
  });
}

export function useTimeline() {
  return useQuery({
    queryKey: ["personalOs", "timeline"],
    queryFn: () => backendApi.personalOs.timeline<import("@/types/personal_os").TimelineData>(),
    enabled: hasBackendToken(),
  });
}

export function useAddTimelineEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; category: string; eventDate: string; description?: string }) =>
      backendApi.personalOs.addTimelineEvent(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personalOs", "timeline"] }),
  });
}

export function useDeleteTimelineEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backendApi.personalOs.deleteTimelineEvent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personalOs", "timeline"] }),
  });
}

export function useMemory(kind?: string) {
  return useQuery({
    queryKey: ["personalOs", "memory", kind ?? "all"],
    queryFn: () => backendApi.personalOs.memory<import("@/types/personal_os").MemoryGroup>(kind),
    enabled: hasBackendToken(),
  });
}

export function useAddMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { kind: string; key: string; content: string; payload?: Record<string, unknown>; importance?: number }) =>
      backendApi.personalOs.addMemory(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personalOs", "memory"] }),
  });
}

export function useUpdateMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; content: string; payload?: Record<string, unknown> }) =>
      backendApi.personalOs.updateMemory(args.id, { content: args.content, payload: args.payload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personalOs", "memory"] }),
  });
}

export function useDeleteMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backendApi.personalOs.deleteMemory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personalOs", "memory"] }),
  });
}

export function useCommandCenter() {
  return useQuery({
    queryKey: ["personalOs", "command-center"],
    queryFn: () => backendApi.personalOs.commandCenter<import("@/types/personal_os").CommandCenterData>(),
    enabled: hasBackendToken(),
  });
}

export function useKnowledge(params?: { category?: string; favorite?: boolean; q?: string }) {
  return useQuery({
    queryKey: ["personalOs", "knowledge", params ?? {}],
    queryFn: () => backendApi.personalOs.knowledge<import("@/types/personal_os").KnowledgeList>(params),
    enabled: hasBackendToken(),
  });
}

export function useAddKnowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; content: string; source?: string; category?: string; tags?: string[]; sourceRef?: string }) =>
      backendApi.personalOs.addKnowledge(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personalOs", "knowledge"] }),
  });
}

export function useUpdateKnowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; patch: Record<string, unknown> }) =>
      backendApi.personalOs.updateKnowledge(args.id, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personalOs", "knowledge"] }),
  });
}

export function useToggleKnowledgeFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backendApi.personalOs.toggleKnowledgeFavorite(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personalOs", "knowledge"] }),
  });
}

export function useDeleteKnowledge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backendApi.personalOs.deleteKnowledge(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personalOs", "knowledge"] }),
  });
}

export function useBriefing() {
  return useQuery({
    queryKey: ["personalOs", "briefing"],
    queryFn: () => backendApi.personalOs.briefing<import("@/types/personal_os").DailyBriefing>(),
    enabled: hasBackendToken(),
  });
}

export function useRegenerateBriefing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => backendApi.personalOs.regenerateBriefing(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personalOs", "briefing"] }),
  });
}

export function useDecisions() {
  return useQuery({
    queryKey: ["personalOs", "decisions"],
    queryFn: () => backendApi.personalOs.decisions<{ items: import("@/types/personal_os").DecisionItem[] }>(),
    enabled: hasBackendToken(),
  });
}

export function useAddDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { question: string; analysis?: string; recommendation?: string; chosenPlan?: string; alternatives?: string }) =>
      backendApi.personalOs.addDecision(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personalOs", "decisions"] }),
  });
}

export function usePlanVersions(subject?: string) {
  return useQuery({
    queryKey: ["personalOs", "plan-versions", subject ?? "all"],
    queryFn: () => backendApi.personalOs.planVersions<{ items: import("@/types/personal_os").PlanVersionItem[] }>(subject),
    enabled: hasBackendToken(),
  });
}

export function useAddPlanVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { subject: string; version: number; title: string; content: string; changeNote?: string }) =>
      backendApi.personalOs.addPlanVersion(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personalOs", "plan-versions"] }),
  });
}

export function useGlobalSearch(q: string) {
  return useQuery({
    queryKey: ["personalOs", "search", q],
    queryFn: () => backendApi.personalOs.search<import("@/types/personal_os").GlobalSearchResult>(q),
    enabled: hasBackendToken() && q.trim().length > 0,
  });
}

export function useExportData() {
  return useQuery({
    queryKey: ["personalOs", "export"],
    queryFn: () => backendApi.personalOs.exportData<{ exportedAt: string; data: Record<string, unknown> }>(),
    enabled: false,
  });
}

export function useClearMemory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => backendApi.personalOs.clearMemory(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["personalOs", "memory"] }),
  });
}

/* ---------------- Phase 7.3 通知中心 ---------------- */
export interface NotificationsResponse {
  notifications: import("@/types/personal_os").AppNotification[];
  unread: number;
}

export function useNotifications(params?: { category?: string; archived?: boolean; unread?: boolean }) {
  return useQuery({
    queryKey: ["notifications", "list", params ?? {}],
    queryFn: () => backendApi.notifications.list<NotificationsResponse>(params),
    enabled: hasBackendToken(),
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backendApi.notifications.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", "list"] }),
  });
}

export function useArchiveNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backendApi.notifications.toggleArchive(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", "list"] }),
  });
}

export function useDeleteNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backendApi.notifications.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", "list"] }),
  });
}

export function useCreateNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; body?: string; category?: string; severity?: string }) =>
      backendApi.notifications.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", "list"] }),
  });
}

/* ---------------- Phase 7.4 智能自动化 + AI 主动服务（/autonomous） ---------------- */

export function useAutonomousOverview() {
  return useQuery({
    queryKey: ["autonomous", "overview"],
    queryFn: () => backendApiAutonomous.overview<AutoOverview>(),
    enabled: hasBackendToken(),
  });
}

export function useBootstrapAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => backendApiAutonomous.bootstrap<BootstrapResult>(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autonomous"] }),
  });
}

export function useScanAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { runWorkflows?: boolean }) =>
      backendApiAutonomous.scan<ScanResult>(vars.runWorkflows ?? true),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autonomous"] }),
  });
}

export function useAutonomousInsights(allowLlm = false) {
  return useQuery({
    queryKey: ["autonomous", "insights", allowLlm],
    queryFn: () => backendApiAutonomous.insights<AutoInsights>(allowLlm),
    enabled: hasBackendToken(),
  });
}

export function useAutonomousCost() {
  return useQuery({
    queryKey: ["autonomous", "cost"],
    queryFn: () => backendApiAutonomous.cost<AutoCost>(),
    enabled: hasBackendToken(),
  });
}

export function useAutonomousEvents() {
  return useQuery({
    queryKey: ["autonomous", "events"],
    queryFn: () => backendApiAutonomous.events<AutoEvent[]>(),
    enabled: hasBackendToken(),
  });
}

export function useAutonomousRuns() {
  return useQuery({
    queryKey: ["autonomous", "runs"],
    queryFn: () => backendApiAutonomous.runs.list<AutomationRun[]>(),
    enabled: hasBackendToken(),
  });
}

/* —— 规则 —— */
export function useRules() {
  return useQuery({
    queryKey: ["autonomous", "rules"],
    queryFn: () => backendApiAutonomous.rules.list<AutomationRule[]>(),
    enabled: hasBackendToken(),
  });
}

export function useCreateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => backendApiAutonomous.rules.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autonomous", "rules"] }),
  });
}

export function useUpdateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: Record<string, unknown> }) =>
      backendApiAutonomous.rules.update(args.id, args.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autonomous", "rules"] }),
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backendApiAutonomous.rules.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autonomous", "rules"] }),
  });
}

export function useRunRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backendApiAutonomous.rules.run(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autonomous"] }),
  });
}

/* —— 定时任务 —— */
export function useSchedules() {
  return useQuery({
    queryKey: ["autonomous", "schedules"],
    queryFn: () => backendApiAutonomous.schedules.list<AutomationSchedule[]>(),
    enabled: hasBackendToken(),
  });
}

export function useCreateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => backendApiAutonomous.schedules.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autonomous", "schedules"] }),
  });
}

export function useUpdateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: Record<string, unknown> }) =>
      backendApiAutonomous.schedules.update(args.id, args.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autonomous", "schedules"] }),
  });
}

export function useDeleteSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backendApiAutonomous.schedules.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autonomous", "schedules"] }),
  });
}

export function useRunSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; force?: boolean }) =>
      backendApiAutonomous.schedules.run(args.id, args.force ?? false),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autonomous"] }),
  });
}

/* —— 工作流 —— */
export function useWorkflows() {
  return useQuery({
    queryKey: ["autonomous", "workflows"],
    queryFn: () => backendApiAutonomous.workflows.list<AutomationWorkflow[]>(),
    enabled: hasBackendToken(),
  });
}

export function useWorkflowTemplates() {
  return useQuery({
    queryKey: ["autonomous", "workflow-templates"],
    queryFn: () => backendApiAutonomous.workflows.templates<WorkflowTemplate[]>(),
    enabled: hasBackendToken(),
  });
}

export function useCreateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => backendApiAutonomous.workflows.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autonomous", "workflows"] }),
  });
}

export function useUpdateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: Record<string, unknown> }) =>
      backendApiAutonomous.workflows.update(args.id, args.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autonomous", "workflows"] }),
  });
}

export function useDeleteWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backendApiAutonomous.workflows.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autonomous", "workflows"] }),
  });
}

export function useRunAutoWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backendApiAutonomous.workflows.run(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autonomous"] }),
  });
}

/* —— Webhook —— */
export function useWebhooks() {
  return useQuery({
    queryKey: ["autonomous", "webhooks"],
    queryFn: () => backendApiAutonomous.webhooks.list<AutomationWebhook[]>(),
    enabled: hasBackendToken(),
  });
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => backendApiAutonomous.webhooks.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autonomous", "webhooks"] }),
  });
}

export function useDeleteWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backendApiAutonomous.webhooks.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autonomous", "webhooks"] }),
  });
}

export function useTestWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backendApiAutonomous.webhooks.test(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autonomous", "webhooks"] }),
  });
}

/* —— 运行记录 —— */
// useAutonomousRuns 已定义

/* —— 行动中心 —— */
export function useActions(status?: ActionStatus) {
  return useQuery({
    queryKey: ["autonomous", "actions", status ?? "all"],
    queryFn: () => backendApiAutonomous.actions.list<AutomationAction[]>(status),
    enabled: hasBackendToken(),
  });
}

export function useActionStats() {
  return useQuery({
    queryKey: ["autonomous", "action-stats"],
    queryFn: () => backendApiAutonomous.actions.stats<ActionStats>(),
    enabled: hasBackendToken(),
  });
}

export function useCreateAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => backendApiAutonomous.actions.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autonomous", "actions"] }),
  });
}

export function useCompleteAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backendApiAutonomous.actions.complete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autonomous", "actions"] }),
  });
}

export function useDismissAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; reason?: string }) =>
      backendApiAutonomous.actions.dismiss(args.id, args.reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autonomous", "actions"] }),
  });
}

export function useDeferAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; days?: number }) =>
      backendApiAutonomous.actions.defer(args.id, args.days ?? 7),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autonomous", "actions"] }),
  });
}

export function useReopenAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backendApiAutonomous.actions.reopen(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autonomous", "actions"] }),
  });
}

export function useDeleteAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backendApiAutonomous.actions.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autonomous", "actions"] }),
  });
}

/* —— 长期计划 —— */
export function usePlans() {
  return useQuery({
    queryKey: ["autonomous", "plans"],
    queryFn: () => backendApiAutonomous.plans.list<AutomationPlan[]>(),
    enabled: hasBackendToken(),
  });
}

export function useCreatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => backendApiAutonomous.plans.create(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autonomous", "plans"] }),
  });
}

export function useUpdatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: Record<string, unknown> }) =>
      backendApiAutonomous.plans.update(args.id, args.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autonomous", "plans"] }),
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => backendApiAutonomous.plans.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autonomous", "plans"] }),
  });
}

export function useRunPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; force?: boolean }) =>
      backendApiAutonomous.plans.run(args.id, args.force ?? false),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autonomous"] }),
  });
}

/* —— 偏好学习 —— */
export function usePreferences() {
  return useQuery({
    queryKey: ["autonomous", "preferences"],
    queryFn: () => backendApiAutonomous.preferences.get<PreferenceProfile>(),
    enabled: hasBackendToken(),
  });
}

export function useLearnPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => backendApiAutonomous.preferences.learn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autonomous", "preferences"] }),
  });
}

export function usePreferenceBias() {
  return useQuery({
    queryKey: ["autonomous", "preference-bias"],
    queryFn: () => backendApiAutonomous.preferences.bias<PreferenceBias>(),
    enabled: hasBackendToken(),
  });
}

/* —— 市场数据 —— */
export function useMarketPrice(symbol: string, marketType = "stock"): UseQueryResult<MarketPrice | undefined> {
  return useQuery({
    queryKey: ["autonomous", "market", "price", symbol, marketType],
    queryFn: () => backendApiAutonomous.market.price<MarketPrice>(symbol, marketType),
    enabled: hasBackendToken() && symbol.trim().length > 0,
  });
}

export function useMarketHistory(symbol: string, days = 30, marketType = "stock") {
  return useQuery({
    queryKey: ["autonomous", "market", "history", symbol, days, marketType],
    queryFn: () => backendApiAutonomous.market.history(symbol, days, marketType),
    enabled: hasBackendToken() && symbol.trim().length > 0,
  });
}

export function usePortfolioChange(): UseQueryResult<PortfolioChange | undefined> {
  return useQuery({
    queryKey: ["autonomous", "market", "portfolio-change"],
    queryFn: () => backendApiAutonomous.market.portfolioChange<PortfolioChange>(),
    enabled: hasBackendToken(),
  });
}

/* ---------------- Phase 7.6 AI 用量中心（/ai/usage） ---------------- */

export interface AiUsageRow {
  model: string;
  provider: string;
  requestType: string;
  calls: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  avgLatencyMs: number;
}

export interface AiUsageTotals {
  calls: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
}

export interface AiUsageResponse {
  usage: AiUsageRow[];
  totals: AiUsageTotals;
}

export function useAiUsage() {
  return useQuery<AiUsageResponse>({
    queryKey: ["ai", "usage"],
    queryFn: () => backendApi.get<AiUsageResponse>("/ai/usage"),
    enabled: hasBackendToken(),
  });
}


