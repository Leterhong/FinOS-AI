// Phase 7.3 Personal OS 前端类型契约（对应 backend/personal_os + notification 扩列）

/** 财富数字分身 Avatar */
export interface WealthAvatarData {
  hasData: boolean;
  message?: string;
  avatar?: {
    id: string;
    avatarName: string;
    profileSummary: string;
    financialStatus: string;
    lifeStage: string;
    riskPreference: string;
    futureOutlook: string;
    updatedAt: string | null;
  };
  twin?: Record<string, unknown>;
  memories?: Record<string, MemoryItem[]>;
  future?: { year: number; value: number }[];
}

export interface MemoryItem {
  id: string;
  kind: string;
  kindLabel?: string;
  key: string;
  content: string;
  payload?: Record<string, unknown>;
  importance: number;
  hitCount?: number;
  updatedAt?: string | null;
}

export interface MemoryGroup {
  hasData: boolean;
  groups: Record<string, MemoryItem[]>;
  labels: Record<string, string>;
}

/** 财富时间线 */
export interface TimelineNode {
  id: string;
  title: string;
  eventDate: string;
  description: string;
  source: string;
  importance: number;
  deletable: boolean;
}

export interface TimelineData {
  hasData: boolean;
  message?: string;
  past: TimelineNode[];
  now: TimelineNode[];
  future: TimelineNode[];
  events: TimelineNode[];
}

/** AI CFO 驾驶舱 */
export interface CommandCenterData {
  hasData: boolean;
  message?: string;
  today?: {
    netWorth: number;
    totalAssets: number;
    healthScore: number;
    healthScoreDelta: number | null;
    savingsRate: number;
    emergencyMonths: number | null;
    riskLevel: string;
    disclaimer: string;
  };
  aiDiscover?: {
    recentChanges: string[];
    anomalies: { id: string; title: string; body: string; severity: string }[];
    opportunities: string[];
  };
  actions?: {
    week: string[];
    months: string[];
    longTerm: string[];
  };
  riskAlerts?: string[];
}

/** 知识中心 */
export interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  source: string;
  sourceRef: string;
  category: string;
  tags: string[];
  favorite: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface KnowledgeList {
  items: KnowledgeItem[];
}

/** 日报 */
export interface DailyBriefing {
  id: string;
  date: string;
  greeting: string;
  wealthChange: string;
  reminders: string;
  actions: string;
  tone: string;
}

/** 决策记录 */
export interface DecisionItem {
  id: string;
  question: string;
  analysis: string;
  recommendation: string;
  chosenPlan: string;
  alternatives: string;
  createdAt: string | null;
}

/** 方案版本 */
export interface PlanVersionItem {
  id: string;
  subject: string;
  version: number;
  title: string;
  content: string;
  changeNote: string;
  createdAt: string | null;
}

/** 全局搜索 */
export interface GlobalSearchResult {
  query: string;
  results: Record<string, { id: string; type: string; title: string; detail: string }[]>;
  total: number;
}

/** 通知（Phase 7.3 扩列 category / archived） */
export interface AppNotification {
  id: string;
  source: string;
  category: string;
  severity: string;
  title: string;
  body: string;
  read: boolean;
  archived: boolean;
  createdAt: string | null;
}
