import type { RiskLevel, RiskSignal } from "@/types/enterprise";

const LEVEL_BASE: Record<RiskLevel, number> = { critical: 90, high: 70, medium: 45, low: 20 };

function baseOf(level: RiskLevel): number {
  return LEVEL_BASE[level] ?? LEVEL_BASE.medium;
}

const STATUS_FACTOR: Record<RiskSignal["status"], number> = {
  待核验: 1,
  已确认: 1.1,
  已缓释: 0.4,
};

export type RiskBand = "重大" | "高" | "中" | "低";

export function riskBand(score: number): RiskBand {
  if (score >= 80) return "重大";
  if (score >= 60) return "高";
  if (score >= 35) return "中";
  return "低";
}

/** 确定性的单条风险评分 0–100：等级为基准，核验状态、证据与关联事实/规则微调。 */
export function scoreRisk(risk: RiskSignal): number {
  const base = baseOf(risk.level);
  const evidenceBonus = Math.min(5, (risk.evidence?.length ?? 0) / 40);
  const ruleBonus = risk.ruleCodes?.length ? 5 : 0;
  const factBonus = risk.factIds?.length ? 3 : 0;
  const score = (base + evidenceBonus + ruleBonus + factBonus) * STATUS_FACTOR[risk.status];
  return Math.max(0, Math.min(100, Math.round(score)));
}

export interface ProjectRiskScore {
  /** 项目聚合风险评分 0–100。 */
  score: number;
  band: RiskBand;
  /** 未缓释的风险条数。 */
  openCount: number;
  /** 最高单条风险评分。 */
  maxScore: number;
  byBand: Record<RiskBand, number>;
}

/** 项目聚合评分：以最高风险为主、整体均值为辅，避免风险条数稀释单条重大风险。 */
export function scoreProject(risks: RiskSignal[]): ProjectRiskScore {
  const scores = risks.map(scoreRisk);
  const open = risks.filter((risk) => risk.status !== "已缓释");
  const byBand: Record<RiskBand, number> = { 重大: 0, 高: 0, 中: 0, 低: 0 };
  for (const score of scores) byBand[riskBand(score)] += 1;
  if (scores.length === 0) {
    return { score: 0, band: "低", openCount: 0, maxScore: 0, byBand };
  }
  const maxScore = Math.max(...scores);
  const average = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  const score = Math.round(maxScore * 0.6 + average * 0.4);
  return { score, band: riskBand(score), openCount: open.length, maxScore, byBand };
}
