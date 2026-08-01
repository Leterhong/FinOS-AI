import "server-only";

import type { FinancialProfile, ProjectionPoint } from "@/data/types";
import { isEmptyProfile } from "@/data/types";
import {
  applyScenario,
  computeCashFlow,
  computeRiskMetrics,
  computeProjection,
  computeProjectedRetireAge,
} from "@/scenario/scenario-engine";

// ── Types ───────────────────────────────────────────────────────────────────

export interface HealthDimension {
  key: "cashflow" | "growth" | "risk" | "goal" | "protection";
  label: string;
  score: number;
  weight: number;
  note?: string;
}

/** AI + Model 综合财富健康评分（0-100）。 */
export interface WealthHealthScore {
  total: number;
  grade: "优秀" | "良好" | "中等" | "偏弱" | "预警";
  dimensions: HealthDimension[];
}

export type TimelineKind = "past" | "present" | "future" | "goal";

export interface WealthTimelinePoint {
  year: number;
  age: number;
  assets: number;
  label?: string;
  kind: TimelineKind;
}

export interface LifeStageResult {
  label: string;
  note: string;
}

export interface TwinOptions {
  /** 已激活的人生事件 id 列表。 */
  events?: string[];
  /** 市场冲击（如 -0.1 表示整体年化收益下调 10%），用于金融事件模拟。 */
  marketShock?: number;
}

/** Financial Twin 的完整动态快照。 */
export interface TwinSnapshot {
  projection: ProjectionPoint[];
  baselineProjection: ProjectionPoint[];
  timeline: WealthTimelinePoint[];
  netWorth: number;
  totalAssets: number;
  projectedRetireAge: number;
  onTrack: boolean;
  /** 距目标退休年龄的差距（年，正=提前，负=延期）。 */
  retireGapYears: number;
  health: WealthHealthScore;
  lifeStage: string;
  lifeStageNote: string;
  /** 模型级洞察文本（供 Twin 卡片 / 页面直接展示）。 */
  insight: string;
  activeEvents: string[];
  /** 是否为空画像计算出的中性快照（无真实数据，不展示任何分析）。 */
  isEmpty?: boolean;
}

/** 空画像对应的中性 Twin 快照：不生成任何财富分析文案。 */
const EMPTY_TWIN_SNAPSHOT: TwinSnapshot = {
  projection: [],
  baselineProjection: [],
  timeline: [],
  netWorth: 0,
  totalAssets: 0,
  projectedRetireAge: 0,
  onTrack: false,
  retireGapYears: 0,
  health: {
    total: 0,
    grade: "预警",
    dimensions: [
      { key: "cashflow", label: "现金流", score: 0, weight: 0.25 },
      { key: "growth", label: "成长", score: 0, weight: 0.25 },
      { key: "risk", label: "风险", score: 0, weight: 0.2 },
      { key: "goal", label: "目标", score: 0, weight: 0.15 },
      { key: "protection", label: "保障", score: 0, weight: 0.15 },
    ],
  },
  lifeStage: "",
  lifeStageNote: "",
  insight: "",
  activeEvents: [],
  isEmpty: true,
};

// ── Core Engine ─────────────────────────────────────────────────────────────

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

function gradeOf(total: number): WealthHealthScore["grade"] {
  if (total >= 85) return "优秀";
  if (total >= 70) return "良好";
  if (total >= 55) return "中等";
  if (total >= 40) return "偏弱";
  return "预警";
}

/**
 * 计算用户 Financial Twin（动态财富模型）。
 * 输入：用户画像 + 人生事件 + 市场变化 → 输出：未来财富轨迹 / 健康评分 / 时间线 / 人生阶段。
 */
export function computeTwin(
  profile: FinancialProfile,
  opts: TwinOptions = {}
): TwinSnapshot {
  const eventIds = opts.events ?? [];

  // 无真实数据：返回中性空快照，禁止生成任何财富分析文案。
  // （真实用户尚未创建画像时，服务端也应保持「不了解你的财富情况」语义。）
  if (isEmptyProfile(profile)) {
    return EMPTY_TWIN_SNAPSHOT;
  }

  // 1) 应用人生事件
  let effective = { ...profile, modifiers: { ...profile.modifiers } };
  for (const id of eventIds) {
    effective = applyScenario(effective, id);
  }

  // 2) 应用市场冲击（金融事件）
  if (opts.marketShock) {
    effective = {
      ...effective,
      modifiers: {
        ...effective.modifiers,
        extraReturn: effective.modifiers.extraReturn + opts.marketShock,
      },
    };
  }

  const projection = computeProjection(effective);
  const baselineProjection = computeProjection(profile);
  const cashFlow = computeCashFlow(effective);
  const risk = computeRiskMetrics(effective);

  const totalAssets =
    effective.cashSavings +
    effective.stockPortfolio +
    effective.realEstate +
    effective.bonds +
    effective.crypto +
    effective.funds +
    effective.house +
    effective.insurance;
  const netWorth = totalAssets - effective.liabilities;
  const projectedRetireAge = computeProjectedRetireAge(effective, projection);
  const onTrack = projectedRetireAge <= effective.goal.retirementAge;
  const retireGapYears = effective.goal.retirementAge - projectedRetireAge;

  const health = computeWealthHealthScore(effective, cashFlow, risk, projection);
  const stage = detectLifeStage(effective);
  const timeline = buildTimeline(effective, projection);

  const insight = onTrack
    ? `当前模型显示您有望在 ${projectedRetireAge} 岁达成退休目标，比计划提前 ${Math.abs(
        retireGapYears
      )} 年。健康分 ${health.total}（${health.grade}）。`
    : `按当前轨迹您将在 ${projectedRetireAge} 岁退休，比目标晚 ${Math.abs(
        retireGapYears
      )} 年。建议提升储蓄率或优化资产配置以弥合缺口。`;

  return {
    projection,
    baselineProjection,
    timeline,
    netWorth,
    totalAssets,
    projectedRetireAge,
    onTrack,
    retireGapYears,
    health,
    lifeStage: stage.label,
    lifeStageNote: stage.note,
    insight,
    activeEvents: eventIds,
  };
}

// ── Wealth Health Score (AI + Model) ────────────────────────────────────────

function computeWealthHealthScore(
  profile: FinancialProfile,
  cashFlow: ReturnType<typeof computeCashFlow>,
  risk: ReturnType<typeof computeRiskMetrics>,
  projection: ProjectionPoint[]
): WealthHealthScore {
  // 现金流维度：储蓄率 + 应急金覆盖
  const cashFlowScore = clamp(Math.round(cashFlow.savingsRate * 1.2));
  const emergencyMonths =
    cashFlow.expenses > 0 ? profile.cashSavings / cashFlow.expenses : 0;
  const liquidityScore = clamp(Math.round((emergencyMonths / 6) * 100));

  // 资产增长维度：未来资产相对当前增长倍数
  const growth =
    projection.length > 1 && projection[0].assets > 0
      ? projection[projection.length - 1].assets / projection[0].assets
      : 1;
  const growthScore = clamp(Math.round((growth - 1) * 18));

  // 风险维度：复用综合风险健康分
  const riskScore = clamp(risk.overall);

  // 目标完成度：退休目标达成率
  const retireGap =
    profile.goal.targetAmount > 0
      ? projection.length > 0
        ? projection[projection.length - 1].assets / profile.goal.targetAmount
        : 0
      : 1;
  const goalScore = clamp(Math.round(retireGap * 100));

  // 保障水平：保险资产覆盖比例
  const coverage = profile.totalAssets > 0 ? profile.insurance / profile.totalAssets : 0;
  const protectionScore = clamp(Math.round(coverage * 500));

  const dimensions: HealthDimension[] = [
    {
      key: "cashflow",
      label: "现金流",
      score: Math.round((cashFlowScore + liquidityScore) / 2),
      weight: 0.25,
      note: `储蓄率 ${cashFlow.savingsRate.toFixed(1)}% · 应急金 ${emergencyMonths.toFixed(
        1
      )} 个月`,
    },
    {
      key: "growth",
      label: "资产增长",
      score: growthScore,
      weight: 0.2,
      note: `未来资产预计增长约 ${Math.round((growth - 1) * 100)}%`,
    },
    {
      key: "risk",
      label: "风险健康",
      score: riskScore,
      weight: 0.2,
      note: `综合风险分 ${risk.overall}`,
    },
    {
      key: "goal",
      label: "目标完成度",
      score: goalScore,
      weight: 0.25,
      note: `退休目标达成率 ${goalScore}%`,
    },
    {
      key: "protection",
      label: "保障水平",
      score: protectionScore,
      weight: 0.1,
      note: `保险覆盖 ${(coverage * 100).toFixed(1)}%`,
    },
  ];

  const total = Math.round(
    dimensions.reduce((s, d) => s + d.score * d.weight, 0)
  );

  return { total, grade: gradeOf(total), dimensions };
}

// ── Life Stage ──────────────────────────────────────────────────────────────

function detectLifeStage(profile: FinancialProfile): LifeStageResult {
  const age = profile.age;
  const hasFamily =
    profile.familyStatus === "family" ||
    profile.familyStatus === "married" ||
    (profile.dependents ?? 0) > 0;

  if (age < 30) {
    return {
      label: "财富萌芽期",
      note: "职业生涯早期，重点是提升收入与建立储蓄习惯。",
    };
  }
  if (age < 40 && hasFamily) {
    return {
      label: "家庭建设期",
      note: "组建家庭阶段，需平衡育儿、置业与资产积累。",
    };
  }
  if (age < 50) {
    return {
      label: "财富积累期",
      note: "收入与职业黄金期，应最大化投资复利与风险资产比例。",
    };
  }
  if (age < 60) {
    return {
      label: "财富守成期",
      note: "临近退休，逐步降低波动，锁定退休现金流。",
    };
  }
  return {
    label: "退休生活期",
    note: "以稳健现金流与资产保值为核心，关注医疗与传承。",
  };
}

// ── Wealth Timeline ──────────────────────────────────────────────────────────

function buildTimeline(
  profile: FinancialProfile,
  projection: ProjectionPoint[]
): WealthTimelinePoint[] {
  const currentYear = new Date().getFullYear();
  const points: WealthTimelinePoint[] = [];

  // 当前
  points.push({
    year: currentYear,
    age: profile.age,
    assets: projection[0]?.assets ?? profile.totalAssets,
    label: "现在",
    kind: "present",
  });

  // 关键未来节点：+5 年、退休、目标年
  const targetYears = new Set<number>();
  targetYears.add(currentYear + 5);
  if (profile.goal?.retirementAge) {
    targetYears.add(currentYear + (profile.goal.retirementAge - profile.age));
  }
  for (const g of profile.goals ?? []) {
    if (g.targetYear) targetYears.add(g.targetYear);
  }

  for (const y of Array.from(targetYears).sort((a, b) => a - b)) {
    if (y <= currentYear) continue;
    const pt = projection.find((p) => p.year === y);
    if (pt) {
      points.push({
        year: y,
        age: pt.age,
        assets: pt.assets,
        label: pt.label ?? `${y} 年`,
        kind: "future",
      });
    }
  }

  // 目标点（goal kind）
  for (const g of profile.goals ?? []) {
    if (g.targetYear && g.targetYear > currentYear) {
      const pt = projection.find((p) => p.year === g.targetYear);
      if (pt) {
        points.push({
          year: g.targetYear,
          age: pt.age,
          assets: pt.assets,
          label: g.label,
          kind: "goal",
        });
      }
    }
  }

  // 终值
  const last = projection[projection.length - 1];
  if (last && last.year > currentYear) {
    points.push({
      year: last.year,
      age: last.age,
      assets: last.assets,
      label: "长期预测",
      kind: "future",
    });
  }

  return points.sort((a, b) => a.year - b.year);
}
