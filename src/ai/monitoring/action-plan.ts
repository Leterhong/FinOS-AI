import "server-only";

import type { FinancialProfile } from "@/data/types";
import { computeCashFlow } from "@/scenario/scenario-engine";
import type { TwinSnapshot } from "@/twin/engine";
import type { ActionItem, ActionPlan, FinancialAlert } from "./types";

/**
 * Wealth Action Plan（Phase 4 六）。
 * 基于画像 / Twin / 已识别的异常事件，自动生成：
 *  - 本周行动：高频、可执行的小步骤。
 *  - 本月行动：中频的调整与复盘。
 *  - 年度行动：低频但影响深远的规划。
 */
export function generateActionPlan(
  profile: FinancialProfile,
  twin: TwinSnapshot,
  alerts: FinancialAlert[]
): ActionPlan {
  const weekly: ActionItem[] = [];
  const monthly: ActionItem[] = [];
  const yearly: ActionItem[] = [];
  const cf = computeCashFlow(profile);
  const has = (type: string) => alerts.some((a) => a.type === type);

  // ── 通用健康习惯（始终建议） ──
  weekly.push({
    id: "wk-review",
    horizon: "weekly",
    category: "review",
    title: "检查本周收支",
    detail: "回顾本周账单与大额支出，确认现金流为正。",
    rationale: "稳定的现金流是财富积累的前提，周度复盘可及早发现异常。",
  });

  monthly.push({
    id: "mo-review",
    horizon: "monthly",
    category: "review",
    title: "复盘资产与组合",
    detail: "查看本月资产变化、投资损益与储蓄率，更新预算。",
    rationale: "月度复盘让财富轨迹保持在可控区间。",
  });

  yearly.push({
    id: "yr-tax",
    horizon: "yearly",
    category: "review",
    title: "年度税务与保障体检",
    detail: "审视保险覆盖、税务优化与遗产/传承安排。",
    rationale: "年度维度的保障与税务安排对长期净值影响显著。",
  });

  // ── 收入下降 / 储蓄率下降 → 现金流修复 ──
  if (has("income-drop") || has("savings-rate-drop")) {
    weekly.push({
      id: "wk-cashflow",
      horizon: "weekly",
      category: "cashflow",
      title: "压缩可变支出",
      detail: "本周内削减非必要订阅与非必需消费，目标先恢复正储蓄。",
      rationale: "收入下降时，先止住现金流出比追求收益更紧迫。",
    });
    monthly.push({
      id: "mo-income",
      horizon: "monthly",
      category: "cashflow",
      title: "评估增收路径",
      detail: "更新简历、盘点副业或技能变现机会，制定 3 个月增收计划。",
      rationale: "收入是储蓄率修复的根本来源，需主动开拓。",
    });
  }

  // ── 应急金不足 → 建立应急金 ──
  if (has("emergency-fund-low")) {
    monthly.push({
      id: "mo-emergency",
      horizon: "monthly",
      category: "cashflow",
      title: "补足应急金",
      detail: "每月将结余的固定比例转入货币基金，直至覆盖 6 个月支出。",
      rationale: "应急金是抵御收入中断与突发支出的安全垫。",
    });
  }

  // ── 风险提升 / 保障缺口 → 保障与配置 ──
  if (has("risk-increase") || has("insurance-gap")) {
    monthly.push({
      id: "mo-insurance",
      horizon: "monthly",
      category: "protection",
      title: "检视保障覆盖",
      detail: "核对寿险 / 重疾 / 医疗保额是否覆盖负债与家庭责任。",
      rationale: "保障缺口会在风险事件下放大财务冲击。",
    });
    yearly.push({
      id: "yr-rebalance",
      horizon: "yearly",
      category: "allocation",
      title: "再平衡资产组合",
      detail: "按风险承受能力重新校准股债现金比例，降低集中度。",
      rationale: "风险上升时需让组合波动回归可承受区间。",
    });
  }

  // ── 目标延期 → 增厚退休 ──
  if (has("goal-delay") || !twin.onTrack) {
    monthly.push({
      id: "mo-retire",
      horizon: "monthly",
      category: "retirement",
      title: "提升退休供款",
      detail: "将每月投资提高 5–10%，优先追加指数基金定投。",
      rationale: `按当前轨迹退休将延后 ${Math.abs(twin.retireGapYears)} 年，需增厚本金与复利。`,
    });
    yearly.push({
      id: "yr-retire",
      horizon: "yearly",
      category: "retirement",
      title: "复核退休目标",
      detail: "重新测算目标退休年龄与所需储备，校准年度储蓄目标。",
      rationale: "目标需随收入与生命周期动态调整。",
    });
  }

  // ── 资产配置偏离（现金偏高） → 部署闲置现金 ──
  if (has("allocation-deviation")) {
    monthly.push({
      id: "mo-deploy",
      horizon: "monthly",
      category: "allocation",
      title: "部署闲置现金",
      detail: "在保留应急金后，将多余现金分批投入权益 / 基金类资产。",
      rationale: "过高现金占比会拖累长期复利，应适度提升风险资产。",
    });
  }

  // ── 资产下降 → 复盘 ──
  if (has("asset-drop")) {
    weekly.push({
      id: "wk-diagnose",
      horizon: "weekly",
      category: "review",
      title: "复盘资产下降原因",
      detail: "区分市场波动与本金流出，记录并制定应对。",
      rationale: "先定位原因，才能决定是持有还是调整。",
    });
  }

  return { weekly, monthly, yearly };
}
