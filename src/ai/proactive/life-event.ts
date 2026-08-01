import "server-only";

/**
 * Phase 6.8 人生事件模拟引擎（需求九）。
 * 流程：复制画像 → 按事件修改 → computeTwin 重算 → 前后对比 + 本地分析。
 * 全部确定性计算，不调 LLM；模拟结果不写回真实画像（只读沙盘）。
 */

import type { FinancialProfile } from "@/data/types";
import { computeTwin } from "@/twin/engine";
import type { TwinSnapshot } from "@/twin/engine";
import { computeCashFlow } from "@/scenario/scenario-engine";
import type {
  LifeEventInput,
  LifeEventResult,
  LifeEventType,
  TwinDigest,
} from "./types";

export const LIFE_EVENT_LABELS: Record<LifeEventType, string> = {
  "buy-house": "买房",
  marriage: "结婚",
  childbirth: "生子",
  "start-business": "创业",
  "job-change": "换工作",
  retirement: "提前退休",
};

function digest(profile: FinancialProfile, twin: TwinSnapshot): TwinDigest {
  const cf = computeCashFlow(profile);
  return {
    healthScore: twin.health.total,
    netWorth: twin.netWorth,
    totalAssets: twin.totalAssets,
    projectedRetireAge: twin.projectedRetireAge,
    onTrack: twin.onTrack,
    monthlySavings: cf.savings,
  };
}

/** 按事件类型修改画像副本（返回新对象，不改原画像）。 */
function mutateProfile(
  base: FinancialProfile,
  input: LifeEventInput
): FinancialProfile {
  const p: FinancialProfile = {
    ...base,
    goal: { ...base.goal },
    modifiers: { ...base.modifiers },
  };
  const params = input.params ?? {};

  switch (input.type) {
    case "buy-house": {
      // 默认首付：现金的 60%（保底留 3 个月支出应急金）
      const reserve = p.monthlyExpenses * 3;
      const defaultDown = Math.max(0, (p.cashSavings - reserve) * 0.8);
      const down = Math.min(
        params.downPayment ?? defaultDown,
        Math.max(0, p.cashSavings)
      );
      const housePrice = down > 0 ? down / 0.3 : 0; // 30% 首付
      const loan = Math.max(0, housePrice - down);
      const mortgage =
        params.monthlyMortgage ?? Math.round(loan * 0.0053); // ≈30 年期月供
      p.cashSavings = Math.max(0, p.cashSavings - down);
      p.house += housePrice;
      p.liabilities += loan;
      p.monthlyExpenses += mortgage;
      break;
    }
    case "marriage": {
      // 一次性婚礼支出（现金的 30%，上限 ¥200,000）+ 家庭支出上升 15%
      const cost = Math.min(p.cashSavings * 0.3, 200000);
      p.cashSavings = Math.max(0, p.cashSavings - cost);
      p.monthlyExpenses = Math.round(p.monthlyExpenses * 1.15);
      p.familyStatus = "married";
      break;
    }
    case "childbirth": {
      // 育儿月支出 + 受抚养人 +1
      p.monthlyExpenses += 4000;
      p.dependents = (p.dependents ?? 0) + 1;
      p.familyStatus = p.familyStatus === "single" ? "family" : (p.familyStatus ?? "family");
      break;
    }
    case "start-business": {
      // 启动资金投入 + 收入进入不稳定期（按 50% 计）
      const defaultCapital = Math.min(p.cashSavings * 0.5, 500000);
      const capital = Math.min(
        params.startupCapital ?? defaultCapital,
        p.cashSavings
      );
      p.cashSavings = Math.max(0, p.cashSavings - capital);
      p.monthlySalary = Math.round(p.monthlySalary * 0.5);
      p.occupation = "创业者";
      break;
    }
    case "job-change": {
      p.monthlySalary =
        params.newMonthlySalary ?? Math.round(p.monthlySalary * 1.2);
      break;
    }
    case "retirement": {
      p.goal.retirementAge = params.retireAge ?? Math.max(p.age + 1, 55);
      break;
    }
  }
  return p;
}

function fmtDelta(before: number, after: number, unit = "¥"): string {
  const d = after - before;
  const sign = d >= 0 ? "+" : "-";
  return `${sign}${unit}${Math.abs(d).toLocaleString()}`;
}

/** 本地分析：必须结合退休目标与风险偏好（禁止泛化）。 */
function buildAnalysis(
  label: string,
  profile: FinancialProfile,
  before: TwinDigest,
  after: TwinDigest
): string[] {
  const lines: string[] = [];
  const scoreDelta = after.healthScore - before.healthScore;
  lines.push(
    `模拟「${label}」后，财富健康分 ${before.healthScore} → ${after.healthScore}（${
      scoreDelta >= 0 ? "+" : ""
    }${scoreDelta}），月结余 ¥${before.monthlySavings.toLocaleString()} → ¥${after.monthlySavings.toLocaleString()}。`
  );

  if (profile.goal.retirementAge > 0) {
    if (after.projectedRetireAge > before.projectedRetireAge) {
      lines.push(
        `该事件预计使退休时点由 ${before.projectedRetireAge} 岁推迟至 ${after.projectedRetireAge} 岁（目标 ${profile.goal.retirementAge} 岁）。若要保住目标，需相应提升月投资额或延后该事件。`
      );
    } else if (after.projectedRetireAge < before.projectedRetireAge) {
      lines.push(
        `该事件反而使退休预期提前至 ${after.projectedRetireAge} 岁，与 ${profile.goal.retirementAge} 岁目标的差距在缩小。`
      );
    } else {
      lines.push(
        `退休预期保持在 ${after.projectedRetireAge} 岁，${profile.goal.retirementAge} 岁退休目标${after.onTrack ? "仍在轨" : "仍有差距"}。`
      );
    }
  }

  if (after.monthlySavings < 0) {
    lines.push(
      "警告：模拟后月度现金流转负，将持续消耗储蓄。这是最优先需要解决的问题（削减开支或提高收入）。"
    );
  }

  const riskLabel =
    profile.riskLevel === "conservative"
      ? "保守型"
      : profile.riskLevel === "aggressive"
        ? "进取型"
        : "稳健型";
  lines.push(
    `以上为沙盘模拟，不影响真实画像；实际决策请结合你的${riskLabel}风险偏好预留安全边际。`
  );
  return lines;
}

/**
 * 模拟人生事件对财富数字分身的影响（只读，不写回画像）。
 */
export function simulateLifeEvent(
  profile: FinancialProfile,
  input: LifeEventInput
): LifeEventResult {
  const label = LIFE_EVENT_LABELS[input.type];
  const beforeTwin = computeTwin(profile);
  const mutated = mutateProfile(profile, input);
  const afterTwin = computeTwin(mutated);

  const before = digest(profile, beforeTwin);
  const after = digest(mutated, afterTwin);

  const deltas = [
    `净资产：¥${before.netWorth.toLocaleString()} → ¥${after.netWorth.toLocaleString()}（${fmtDelta(before.netWorth, after.netWorth)}）`,
    `财富健康分：${before.healthScore} → ${after.healthScore}`,
    `月结余：¥${before.monthlySavings.toLocaleString()} → ¥${after.monthlySavings.toLocaleString()}（${fmtDelta(before.monthlySavings, after.monthlySavings)}）`,
    `预计退休年龄：${before.projectedRetireAge} 岁 → ${after.projectedRetireAge} 岁`,
  ];

  return {
    type: input.type,
    label,
    before,
    after,
    deltas,
    analysis: buildAnalysis(label, profile, before, after),
    simulatedAt: Date.now(),
  };
}
