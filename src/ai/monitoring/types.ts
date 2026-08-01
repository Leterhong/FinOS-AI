// ── Phase 4：Autonomous AI Wealth Manager 类型定义 ──────────────────────────
// 全部为纯数据类型，不含任何 UI / 服务端实现。客户端与服务端共享。

/** 异常事件严重级别。 */
export type AlertSeverity = "critical" | "warn" | "info";

/** 可被自动识别的财务异常事件类型。 */
export type FinancialEventType =
  | "income-drop" // 收入下降
  | "expense-increase" // 支出增加
  | "savings-rate-drop" // 储蓄率下降
  | "asset-drop" // 资产下降
  | "risk-increase" // 风险提升
  | "goal-delay" // 目标延期
  | "emergency-fund-low" // 应急金不足
  | "allocation-deviation" // 资产配置偏离
  | "insurance-gap" // 保障缺口
  | "expense-consecutive" // 连续多月支出上升（Phase 6.8）
  | "investment-concentration"; // 投资过度集中（Phase 6.8）

/** 财务异常事件（由 Event Detector 自动识别）。 */
export interface FinancialAlert {
  id: string;
  type: FinancialEventType;
  severity: AlertSeverity;
  title: string;
  message: string;
  /** 指标名（用于展示，如 "月收入"）。 */
  metric?: string;
  /** 变化前数值。 */
  before?: number;
  /** 变化后数值。 */
  after?: number;
  /** 变化百分比（正=上升，负=下降）。 */
  changePct?: number;
  detectedAt: number;
}

/** 提醒类别。 */
export type NotificationCategory = "wealth" | "risk" | "goal" | "opportunity";
/** 提醒优先级。 */
export type NotificationPriority = "high" | "medium" | "low";

/** 主动提醒（由 Notification Engine 生成，面向用户推送）。 */
export interface WealthNotification {
  id: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  message: string;
  createdAt: number;
  /** 关联的异常事件 id（若是事件派生）。 */
  relatedAlertId?: string;
}

/** 行动周期。 */
export type ActionHorizon = "weekly" | "monthly" | "yearly";
/** 行动主题。 */
export type ActionCategory =
  | "protection"
  | "allocation"
  | "retirement"
  | "cashflow"
  | "goal"
  | "review";

/** 单条行动项（Wealth Action Plan）。 */
export interface ActionItem {
  id: string;
  horizon: ActionHorizon;
  category: ActionCategory;
  title: string;
  detail: string;
  /** 为什么建议这么做（依据）。 */
  rationale: string;
}

/** 财富行动计划（本周 / 本月 / 年度）。 */
export interface ActionPlan {
  weekly: ActionItem[];
  monthly: ActionItem[];
  yearly: ActionItem[];
}

/** 目标完成状态。 */
export type GoalStatus = "on-track" | "at-risk" | "delayed" | "achieved";

/** 单个目标的进度追踪（Goal Tracking）。 */
export interface GoalProgress {
  id: string;
  type: string;
  label: string;
  targetAmount?: number;
  /** 当前可动用 / 已积累金额（用于完成度计算）。 */
  currentAmount: number;
  /** 完成百分比 0-100（封顶）。 */
  progressPct: number;
  targetYear?: number;
  status: GoalStatus;
  note: string;
}

/** AI CFO 主动简报（打开系统时主动推送）。 */
export interface AdvisorBriefing {
  greeting: string;
  /** 发现的变化数量。 */
  changeCount: number;
  /** 变化描述列表（用于"我发现了 N 个变化"）。 */
  changes: string[];
  /** 优先行动建议列表。 */
  topActions: string[];
  /** 一句总结。 */
  summary: string;
  generatedAt: number;
}

/** 一次主动监控体检的完整结果。 */
export interface MonitoringResult {
  monitoredAt: number;
  alerts: FinancialAlert[];
  notifications: WealthNotification[];
  goalProgress: GoalProgress[];
  actionPlan: ActionPlan;
  briefing: AdvisorBriefing;
  /** 综合财富健康分（来自 Twin）。 */
  healthScore: number;
  netWorth: number;
  onTrack: boolean;
}
