// ── Phase 6.8：Proactive AI CFO 主动财富管家 类型定义 ──────────────────────
// 纯数据类型，客户端与服务端共享（不含任何实现）。
// proactive 层叠加在 Phase 4 monitoring 层之上：复用其事件/简报/行动计划原语，
// 增加：通知持久化、Notification Policy、分级 AI 建议、调度状态、人生事件模拟。

import type {
  AlertSeverity,
  FinancialAlert,
  FinancialEventType,
  MonitoringResult,
  NotificationCategory,
  NotificationPriority,
} from "@/ai/monitoring/types";

// ── 用户控制（需求十一：开启关闭 / 频率 / 关注领域） ──────────────────────

/** 主动监控频率。 */
export type ProactiveFrequency = "daily" | "weekly" | "off";

/** 主动提醒设置（用户可控）。 */
export interface ProactiveSettings {
  /** 主动提醒总开关。false = AI CFO 完全静默（验收测试 4）。 */
  enabled: boolean;
  /** 主动体检频率。 */
  frequency: ProactiveFrequency;
  /** 关注领域：仅这些类别的通知会被推送。 */
  focusAreas: NotificationCategory[];
  /** 抑制低价值提醒（low 优先级不推送，需求十二）。 */
  suppressLowPriority: boolean;
  updatedAt: number;
}

export const DEFAULT_PROACTIVE_SETTINGS: ProactiveSettings = {
  enabled: true,
  frequency: "daily",
  focusAreas: ["wealth", "risk", "goal", "opportunity"],
  suppressLowPriority: true,
  updatedAt: 0,
};

// ── 主动通知（需求五：标题 / 等级 / 原因 / 建议 / 时间） ──────────────────

/** 通知来源。 */
export type ProactiveSource =
  | "monitor" // 主动体检
  | "daily-brief" // 每日简报
  | "weekly-report" // 每周报告
  | "life-event" // 人生事件模拟
  | "market-monitor"; // Phase 6.9 市场/持仓风险监控（大跌预警、重大新闻）

/** 持久化的主动通知（Notification Center 数据单元）。 */
export interface ProactiveNotification {
  id: string;
  userId: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  severity: AlertSeverity;
  /** 事件标题。 */
  title: string;
  /** 发生原因（基于真实数据变化的解释）。 */
  reason: string;
  /** 建议动作。 */
  suggestion: string;
  /** 来源事件类型（若由事件派生）。 */
  eventType?: FinancialEventType;
  source: ProactiveSource;
  read: boolean;
  dismissed: boolean;
  createdAt: number;
}

// ── 分级 AI 建议（需求三 / 十三：成本控制） ───────────────────────────────

/** 建议生成层级：local=纯代码规则；light=轻量模型；full=深度分析模型。 */
export type AdviceTier = "local" | "light" | "full";

/** 一次主动建议的生成结果。 */
export interface ProactiveAdvice {
  tier: AdviceTier;
  /** 建议正文（本地模板或 LLM 生成）。 */
  text: string;
  /** 是否实际调用了 LLM。 */
  usedLLM: boolean;
  /** 是否注入了长期记忆（目标 / 历史决策 / 风险偏好）。 */
  personalized: boolean;
  /** LLM 被跳过 / 降级的原因（预算超限、未配模型、调用失败等）。 */
  degradeReason?: string;
  generatedAt: number;
}

// ── 运行记录与调度（需求七 / 十三） ───────────────────────────────────────

/** 单次主动体检运行日志（也充当变化检测的历史快照）。 */
export interface ProactiveRunLog {
  runAt: number;
  kind: "manual" | "daily" | "weekly";
  eventCount: number;
  criticalCount: number;
  /** 本次运行实际发起的 LLM 调用次数（验收测试 3：无变化应为 0）。 */
  aiCalls: number;
  healthScore: number;
  netWorth: number;
  totalAssets: number;
  /** 历史快照字段：用于连续支出上升等趋势检测。 */
  monthlySalary: number;
  monthlyExpenses: number;
  notificationCount: number;
  suppressedCount: number;
}

/** 调度状态（每日 / 每周报告是否到期）。 */
export interface ScheduleStatus {
  frequency: ProactiveFrequency;
  enabled: boolean;
  lastDailyRun: number | null;
  lastWeeklyRun: number | null;
  /** 距上次运行是否已满 1 天 / 7 天。 */
  dueDaily: boolean;
  dueWeekly: boolean;
}

// ── 主动体检结果（需求一 / 六） ───────────────────────────────────────────

/** 一次完整主动体检（runProactiveMonitor）的返回。 */
export interface ProactiveResult {
  ranAt: number;
  /** 底层确定性体检结果（Phase 4 monitoring）。 */
  monitoring: MonitoringResult;
  /** 检测到的事件（含 Phase 6.8 新增两类）。 */
  events: FinancialAlert[];
  /** 经 Notification Policy 过滤后真正入库推送的通知。 */
  notifications: ProactiveNotification[];
  /** 被策略抑制（低价值 / 24h 去重 / 领域不匹配）的数量。 */
  suppressed: number;
  /** 分级 AI 建议（无异常时为 null，不调 LLM）。 */
  advice: ProactiveAdvice | null;
  /** 本次运行 LLM 调用次数（成本审计）。 */
  aiCalls: number;
  /** 是否因预算超限被降级。 */
  budgetBlocked: boolean;
}

// ── 每日 / 每周报告（需求七） ─────────────────────────────────────────────

/** 每日财富简报。 */
export interface DailyBrief {
  date: string; // YYYY-MM-DD
  headline: string;
  changes: string[];
  attention: string[];
  suggestion: string;
  healthScore: number;
  netWorth: number;
  generatedAt: number;
}

/** 每周财富报告。 */
export interface WeeklyReport {
  weekOf: string; // 周起始日 YYYY-MM-DD
  assetSummary: string;
  incomeExpenseSummary: string;
  investmentSummary: string;
  goalSummary: string;
  aiSuggestions: string[];
  healthScore: number;
  netWorth: number;
  generatedAt: number;
}

// ── 人生事件模拟（需求九） ────────────────────────────────────────────────

/** 支持的人生事件类型。 */
export type LifeEventType =
  | "buy-house" // 买房
  | "marriage" // 结婚
  | "childbirth" // 生子
  | "start-business" // 创业
  | "job-change" // 换工作
  | "retirement"; // 退休

/** 人生事件模拟输入。 */
export interface LifeEventInput {
  type: LifeEventType;
  /** 可选参数：如购房首付、新工作薪资等（缺省用合理默认）。 */
  params?: {
    /** 买房：首付金额。 */
    downPayment?: number;
    /** 买房：贷款月供。 */
    monthlyMortgage?: number;
    /** 换工作：新月薪。 */
    newMonthlySalary?: number;
    /** 创业：初始投入。 */
    startupCapital?: number;
    /** 退休：目标退休年龄。 */
    retireAge?: number;
  };
}

/** Twin 关键指标快照（模拟前后对比用）。 */
export interface TwinDigest {
  healthScore: number;
  netWorth: number;
  totalAssets: number;
  projectedRetireAge: number;
  onTrack: boolean;
  monthlySavings: number;
}

/** 人生事件模拟结果。 */
export interface LifeEventResult {
  type: LifeEventType;
  label: string;
  before: TwinDigest;
  after: TwinDigest;
  /** 关键指标变化描述。 */
  deltas: string[];
  /** AI CFO 分析结论（本地规则生成，结合目标与风险偏好）。 */
  analysis: string[];
  simulatedAt: number;
}
