/**
 * FinOS AI Phase 7.4 智能自动化 + AI 主动服务 — 前端类型契约。
 * 与 backend/autonomous/router.py 46 端点返回结构一一对齐。
 */

export type Severity = "critical" | "high" | "medium" | "low";
export type ActionStatus = "pending" | "done" | "dismissed" | "deferred";
export type Tier = "local" | "light" | "ai";
export type Frequency = "daily" | "weekly" | " monthly" | "event" | "once";
export type AgentKind = "retirement" | "investment" | "cashflow" | "risk";

export interface ConditionSpec {
  metric: string;
  op: string;
  value?: string | number;
  threshold?: number;
}

export interface ActionSpec {
  type: string;
  params?: Record<string, unknown>;
}

export interface AutomationRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  triggerType: string;
  conditions: ConditionSpec[];
  actions: ActionSpec[];
  tier: Tier;
  cooldownSeconds: number;
  triggerCount: number;
  lastTriggeredAt: string | null;
  createdAt: string | null;
}

export interface AutomationSchedule {
  id: string;
  name: string;
  enabled: boolean;
  frequency: string;
  taskType: string;
  taskTypeLabel: string;
  hour: number;
  weekday: number;
  dayOfMonth: number;
  params: Record<string, unknown>;
  tier: Tier;
  runCount: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string | null;
}

export interface AutomationWorkflow {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  steps: unknown[];
  tier: Tier;
  runCount: number;
  lastRunAt: string | null;
  createdAt: string | null;
}

export interface AutomationWebhook {
  id: string;
  name: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  enabled: boolean;
  events: string[];
  callCount: number;
  lastCalledAt: string | null;
  lastStatus: number | null;
  createdAt: string | null;
}

export interface AutomationRun {
  id: string;
  source: string;
  sourceId?: string | null;
  name: string;
  status: string;
  tier?: string;
  llmCalled?: boolean;
  tokensUsed?: number;
  message?: string;
  createdAt: string | null;
}

export interface AutomationAction {
  id: string;
  title: string;
  detail?: string;
  category: string;
  priority: Severity;
  status: ActionStatus;
  statusLabel: string;
  feedback?: Record<string, unknown>;
  sourceId?: string | null;
  dueAt?: string | null;
  completedAt?: string | null;
  createdAt: string | null;
}

export interface AutomationPlan {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  agentKind: AgentKind | string;
  agentLabel: string;
  cadence: string;
  runCount: number;
  lastSummary?: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  createdAt: string | null;
}

export interface AutoEvent {
  id: string;
  eventType: string;
  eventLabel: string;
  metric?: string;
  prevValue?: number | null;
  newValue?: number | null;
  changePct?: number | null;
  severity: Severity;
  summary: string;
  triggeredRuleIds?: string[];
  createdAt: string | null;
}

export interface ActionStats {
  total: number;
  byStatus: Record<ActionStatus, number>;
  byPriority: Record<Severity, number>;
  pending: number;
  acceptanceRate: number;
}

export interface AutoCost {
  dailyBudget: number;
  llmCallsToday: number;
  budgetLeft: number;
  runsToday: number;
  localRatio: number;
  cacheEntries: number;
  policy: string;
}

export interface PreferenceBias {
  minPriority: Severity;
  note: string;
  boostCategories: string[];
}

export interface PreferenceProfile {
  agent: string;
  agentName: string;
  dimensions: {
    dimension: string;
    value: Record<string, unknown>;
    confidence: number;
    sampleCount: number;
    updatedAt: string | null;
  }[];
  learned: boolean;
  generatedAt: string;
}

export interface AutoOverview {
  hasData: boolean;
  message?: string;
  engine: {
    running: boolean;
    rules: { total: number; enabled: number };
    schedules: { total: number; enabled: number };
    workflows: { total: number; enabled: number };
    plans: { total: number; enabled: number };
    subscribers: number;
  };
  watching: {
    kind: string;
    title: string;
    detail: string;
    cadence?: string;
    nextRunAt?: string | null;
    triggerCount?: number;
    lastTriggeredAt?: string | null;
  }[];
  currentTasks: {
    id: string;
    name: string;
    taskType: string;
    taskTypeLabel: string;
    frequency: string;
    nextRunAt?: string | null;
    dueInMinutes?: number | null;
  }[];
  recentRuns: AutomationRun[];
  recentEvents: AutoEvent[];
  nextSteps: {
    id: string;
    title: string;
    priority: Severity;
    category: string;
    detail?: string;
  }[];
  actionStats: ActionStats;
  cost: AutoCost;
  preferenceBias: PreferenceBias;
  generatedAt: string;
  disclaimer: string;
}

export interface ScanResult {
  eventsDetected: number;
  events: AutoEvent[];
  workflowRuns: unknown[];
  scannedAt: string;
  message: string;
}

export interface BootstrapResult {
  rulesCreated: number;
  schedulesCreated: number;
  plansCreated: number;
  snapshotCreated: boolean;
  message: string;
}

export interface AutoInsights {
  investment: Record<string, unknown>;
  cashflow: Record<string, unknown>;
  disclaimer: string;
}

export interface MarketPrice {
  symbol: string;
  marketType?: string;
  price?: number;
  currency?: string;
  changePct?: number;
  asOf?: string | null;
  cached?: boolean;
  degraded?: boolean;
  status?: string;
  reason?: string;
}

export interface MarketHistoryPoint {
  date: string;
  price: number;
}

export interface PortfolioChange {
  totalChangePct?: number;
  degraded?: boolean;
  reason?: string;
  holdings?: Record<string, unknown>[];
}

export interface WorkflowTemplate {
  key: string;
  name: string;
  description?: string;
  steps?: unknown[];
}
