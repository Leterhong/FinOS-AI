import "server-only";

import type { FinancialProfile } from "@/data/types";
import type { TwinSnapshot } from "@/twin/engine";
import type { AgentAnalysisOutput } from "@/ai/types";
import type { ActionPlanJSON, ActionTaskItem } from "./types";
import type { WealthTaskInput, PlanHorizon } from "@/wealth/tasks";

export interface ActionAgentInput {
  /** 目标名称（如 "50 岁退休"）。 */
  goal: string;
  /** 目标类型（retirement / house-planning / 等）。 */
  goalType?: string;
  /** Strategy Agent 输出（文字或结构化），作为拆解依据。 */
  strategy?: AgentAnalysisOutput | string;
  twin: TwinSnapshot;
  profile: FinancialProfile;
  /** 用户偏好（如风险偏好）。 */
  preference?: { riskLevel?: string };
}

function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("zh-CN");
}

/**
 * Action Agent（财富执行 Agent，Phase 5 一）。
 *
 * 把 Strategy Agent 输出 + Financial Twin + Goals + User Preference
 * 转换为可执行的 Action Plan JSON。全部为确定性逻辑（不依赖 LLM），
 * 在沙箱/离线环境都能稳定产出。未来可替换为 LLM 版本而不改调用方。
 */
export function generateActionPlan(input: ActionAgentInput): ActionPlanJSON {
  const { goal, twin, profile } = input;
  const riskLevel = input.preference?.riskLevel ?? profile.riskLevel ?? "moderate";

  const monthlyExpenses = profile.monthlyExpenses || 1;
  const monthlyIncome = profile.monthlySalary || 1;
  const emergencyMonths =
    profile.cashSavings > 0 ? profile.cashSavings / monthlyExpenses : 0;

  const onTrack = twin.onTrack;
  const gap = twin.retireGapYears; // 正=提前，负=延期

  const tasks: ActionTaskItem[] = [];

  // 1) 应急储备金（现金流优化）— 高优先级
  {
    const targetMonths = 6;
    const monthlyCost = monthlyExpenses;
    const targetCash = targetMonths * monthlyCost;
    const gapCash = Math.max(0, targetCash - profile.cashSavings);
    const desc =
      emergencyMonths >= targetMonths
        ? `应急储备充足（约 ${emergencyMonths.toFixed(1)} 个月生活费），维持现金 ¥${fmt(
            profile.cashSavings
          )} 不动用。`
        : `当前应急金约 ${emergencyMonths.toFixed(1)} 个月生活费，缺口 ¥${fmt(
            gapCash
          )}。建议在未来 30 天补足至 6 个月（¥${fmt(targetCash)}）。`;
    tasks.push({
      title: "建立 / 补足应急储备金",
      description: desc,
      deadline: isoInDays(30),
      priority: emergencyMonths < targetMonths ? "high" : "medium",
      category: "cashflow-optimization",
      status: "pending",
    });
  }

  // 2) 提升每月定投（退休准备 / 财富增长）— 高优先级
  {
    const monthlyInvest = profile.monthlyInvestment || 0;
    const suggested = onTrack
      ? monthlyInvest
      : Math.round(monthlyInvest * 1.25 + monthlyIncome * 0.05);
    const desc = onTrack
      ? `当前每月投资 ¥${fmt(monthlyInvest)}，退休轨迹已达标（预计 ${
          twin.projectedRetireAge
        } 岁），保持节奏即可。`
      : `按当前轨迹预计 ${
          twin.projectedRetireAge
        } 岁退休，距目标差 ${Math.abs(gap)} 年。建议 30 天内将每月投资由 ¥${fmt(
          monthlyInvest
        )} 提升至 ¥${fmt(suggested)}，以弥合缺口。`;
    tasks.push({
      title: onTrack ? "维持每月定投节奏" : "提升每月定投金额",
      description: desc,
      deadline: isoInDays(30),
      priority: onTrack ? "medium" : "high",
      category: "retirement-prep",
      status: "pending",
    });
  }

  // 3) 优化资产配置（投资调整）— 中优先级
  {
    const targetEquityPct =
      riskLevel === "aggressive" ? 75 : riskLevel === "moderate" ? 60 : 40;
    tasks.push({
      title: "优化资产配置比例",
      description: `按「${riskLabel(riskLevel)}」风险偏好，将权益类（股票+基金）目标比例调整至约 ${targetEquityPct}%，降低单一资产集中度。`,
      deadline: isoInDays(60),
      priority: "medium",
      category: "investment-adjustment",
      status: "pending",
    });
  }

  // 4) 保障检视（保障配置）— 中优先级
  {
    const coveragePct =
      profile.totalAssets > 0
        ? (profile.insurance / profile.totalAssets) * 100
        : 0;
    tasks.push({
      title: "检视并补足保险保障",
      description:
        coveragePct < 5
          ? `当前保险覆盖仅 ${coveragePct.toFixed(1)}%，建议配置重疾险与定期寿险，保额覆盖 3-5 倍年收入。`
          : `当前保险覆盖 ${coveragePct.toFixed(1)}%，年度检视保额是否匹配家庭责任变化。`,
      deadline: isoInDays(90),
      priority: coveragePct < 5 ? "medium" : "low",
      category: "protection",
      status: "pending",
    });
  }

  // 5) 年度复盘（复盘）— 低优先级
  tasks.push({
    title: "年度财富复盘",
    description: `每年复核退休进度（当前预计 ${
      twin.projectedRetireAge
    } 岁）与计划执行率，按生活变化调整目标。`,
    deadline: isoInDays(365),
    priority: "low",
    category: "review",
    status: "pending",
  });

  // 计划整体优先级
  const planPriority: ActionPlanJSON["priority"] =
    !onTrack || emergencyMonths < 3 ? "high" : emergencyMonths < 6 ? "medium" : "low";

  return { goal, priority: planPriority, tasks };
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
 * 把 ActionPlanJSON 转为 WealthTask 输入（供 Task System 持久化）。
 * 自动附带 goal / source / planHorizon。
 */
export function toWealthTasks(
  plan: ActionPlanJSON,
  opts?: { planHorizon?: PlanHorizon; source?: string }
): WealthTaskInput[] {
  return plan.tasks.map((t) => ({
    goal: plan.goal,
    category: t.category,
    title: t.title,
    description: t.description,
    priority: t.priority,
    deadline: t.deadline,
    status: "pending",
    source: opts?.source ?? "action-agent",
    planHorizon: opts?.planHorizon,
  }));
}
