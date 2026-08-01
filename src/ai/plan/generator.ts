import "server-only";

import type { FinancialProfile } from "@/data/types";
import type { TwinSnapshot } from "@/twin/engine";
import type { TaskCategory } from "@/wealth/tasks";

/** 计划档位。 */
export type PlanTier = "short" | "medium" | "long";

/** 计划阶段中的单条行动。 */
export interface PlanStep {
  title: string;
  detail: string;
  category: TaskCategory;
}

/** 一个计划档位（含若干行动）。 */
export interface PlanPhase {
  horizon: PlanTier;
  label: string;
  goal: string;
  steps: PlanStep[];
}

/** 三档财富计划。 */
export interface WealthPlan {
  goal: string;
  short: PlanPhase;
  medium: PlanPhase;
  long: PlanPhase;
}

export interface PlanGeneratorInput {
  twin: TwinSnapshot;
  profile: FinancialProfile;
  goal?: string;
  goalType?: string;
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("zh-CN");
}

function riskLabel(r: string): string {
  return r === "aggressive"
    ? "进取型"
    : r === "moderate"
    ? "平衡型"
    : r === "conservative"
    ? "稳健型"
    : "谨慎型";
}

/**
 * Wealth Plan Generator（Phase 5 五）。
 *
 * 生成短期（30 天）/ 中期（1 年）/ 长期（5-20 年）三档计划。
 * 以退休计划为例，分阶段推进：建立现金储备 → 优化资产配置 → 增加长期投资。
 * 全部为确定性逻辑，结合 Twin 与画像动态生成可执行阶段。
 */
export function generateWealthPlan(input: PlanGeneratorInput): WealthPlan {
  const { twin, profile, goal = "50 岁退休", goalType = "retirement" } = input;
  const riskLevel = profile.riskLevel ?? "moderate";
  const monthlyExpenses = profile.monthlyExpenses || 1;
  const emergencyMonths =
    profile.cashSavings > 0 ? profile.cashSavings / monthlyExpenses : 0;
  const monthlyInvest = profile.monthlyInvestment || 0;
  const onTrack = twin.onTrack;

  // 退休目标的三个阶段（spec 示例）
  const isRetirement = goalType === "retirement" || goalType === "retirement-prep";

  // ── 短期：30 天 ──
  const shortSteps: PlanStep[] = [
    {
      title: "建立应急现金储备",
      detail:
        emergencyMonths >= 6
          ? `应急金约 ${emergencyMonths.toFixed(1)} 个月，维持 ¥${fmt(
              profile.cashSavings
            )} 不动用。`
          : `30 天内将现金储备补足至 6 个月生活费（约 ¥${fmt(
              6 * monthlyExpenses
            )}），当前缺口 ¥${fmt(6 * monthlyExpenses - profile.cashSavings)}。`,
      category: "cashflow-optimization",
    },
    {
      title: "锁定本月定投",
      detail: onTrack
        ? `本月按 ¥${fmt(monthlyInvest)} 定投，保持退休节奏。`
        : `本月将定投提升至 ¥${fmt(
            Math.round(monthlyInvest * 1.25 + profile.monthlySalary * 0.05)
          )}，弥合退休缺口。`,
      category: "retirement-prep",
    },
    {
      title: "记账并削减非必要支出",
      detail: "启用预算跟踪，识别并削减 1-2 项可优化的固定开销。",
      category: "cashflow-optimization",
    },
  ];

  // ── 中期：1 年 ──
  const mediumSteps: PlanStep[] = [
    {
      title: "资产配置再平衡",
      detail: `按「${riskLabel(
        riskLevel
      )}」偏好将权益类比例调整至目标区间，每年再平衡一次。`,
      category: "investment-adjustment",
    },
    {
      title: "补足保险保障",
      detail: "配置重疾险与定期寿险，保额覆盖 3-5 倍年收入，护住家庭底线。",
      category: "protection",
    },
    {
      title: "提升主动收入",
      detail: "围绕主业争取加薪 / 副业变现，将增量收入的 50% 投入投资。",
      category: "wealth-growth",
    },
    {
      title: "年度财富复盘",
      detail: `复核退休进度（当前预计 ${
        twin.projectedRetireAge
      } 岁）与计划执行率。`,
      category: "review",
    },
  ];

  // ── 长期：5-20 年 ──
  const longSteps: PlanStep[] = isRetirement
    ? [
        {
          title: "长期复利投资",
          detail: "以指数基金定投为核心，利用时间复利放大退休本金。",
          category: "wealth-growth",
        },
        {
          title: "积累退休专属账户",
          detail: `目标退休金 ¥${fmt(profile.goal.targetAmount)}，持续增配至达成。`,
          category: "retirement-prep",
        },
        {
          title: "临近退休降波动",
          detail: "退休前 5-10 年逐步降低权益比例，锁定下行风险。",
          category: "risk-reduction",
        },
        {
          title: "锁定退休现金流",
          detail: "配置年金 / 债券等稳定现金流，确保退休后收入可预期。",
          category: "retirement-prep",
        },
      ]
    : [
        {
          title: "长期财富积累",
          detail: "以定投与复利为核心，持续扩大可投资资产规模。",
          category: "wealth-growth",
        },
        {
          title: "阶段性再平衡",
          detail: "每 1-2 年根据目标进度调整配置比例。",
          category: "investment-adjustment",
        },
        {
          title: "目标达成检视",
          detail: "按目标时间轴复核完成度，必要时加速积累。",
          category: "review",
        },
      ];

  return {
    goal,
    short: { horizon: "short", label: "30 天计划", goal, steps: shortSteps },
    medium: { horizon: "medium", label: "1 年计划", goal, steps: mediumSteps },
    long: { horizon: "long", label: "5-20 年计划", goal, steps: longSteps },
  };
}

/** 将 PlanPhase 转为 WealthTask 输入（含相对截止日）。 */
export function phaseToTasks(
  phase: PlanPhase,
  userId: string,
  daysOffset: number
): import("@/wealth/tasks").WealthTaskInput[] {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  const deadline = d.toISOString().slice(0, 10);
  return phase.steps.map((s) => ({
    goal: phase.goal,
    category: s.category,
    title: s.title,
    description: s.detail,
    priority: "medium",
    deadline,
    status: "pending",
    source: "plan",
    planHorizon: phase.horizon,
  }));
}
