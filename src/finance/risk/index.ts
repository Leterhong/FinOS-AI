import "server-only";

/**
 * 投资风险分析（Phase 6.9 需求七 / 验收测试 3）。
 *  - 结合：用户风险等级 + 市场数据 + 投资组合 → 真实风险分析（零 LLM）。
 *  - 股票大跌（今日跌幅超阈值）→ 生成 Risk 提醒并写入通知中心
 *    （复用 Phase 6.8 proactiveStore + 免骚扰 Policy + 24h 去重）。
 */

import type { FinancialProfile } from "@/data/types";
import {
  proactiveStore,
  newNotificationId,
  applyNotificationPolicy,
} from "@/ai/proactive/notification";
import type { ProactiveNotification } from "@/ai/proactive/types";
import type {
  InvestmentRiskReport,
  MarketOverview,
  PortfolioAnalysis,
  PortfolioFinding,
  PortfolioView,
  RiskGrade,
} from "../types";
import { INVESTMENT_DISCLAIMER } from "../types";

const RISK_LABEL: Record<FinancialProfile["riskLevel"], string> = {
  conservative: "保守型",
  moderate: "稳健型",
  aggressive: "进取型",
};

/** 各风险偏好可接受的股票类占比上限（组合内股票占投资组合比例） */
const STOCK_SHARE_LIMIT: Record<FinancialProfile["riskLevel"], number> = {
  conservative: 0.3,
  moderate: 0.6,
  aggressive: 0.85,
};

/** 单日大跌预警阈值（%） */
export const SHARP_DROP_PCT = -8;
/** 单日大跌 critical 阈值（%） */
export const SHARP_DROP_CRITICAL_PCT = -12;

const gradeRank: Record<RiskGrade, number> = { low: 0, medium: 1, high: 2 };
const maxGrade = (a: RiskGrade, b: RiskGrade): RiskGrade =>
  gradeRank[a] >= gradeRank[b] ? a : b;

/**
 * 生成投资风险报告（纯代码）。
 */
export function assessInvestmentRisk(input: {
  profile: FinancialProfile;
  view: PortfolioView;
  analysis: PortfolioAnalysis | null;
  market: MarketOverview;
}): InvestmentRiskReport | null {
  const { profile, view, analysis, market } = input;
  if (!view.hasInvestments) return null;

  const alerts: PortfolioFinding[] = [];
  let grade: RiskGrade = "low";
  const userRiskLabel = RISK_LABEL[profile.riskLevel] ?? profile.riskLevel;

  // 1) 组合股票占比 vs 用户风险偏好（需求七示例：股票占比 80%）
  const stockShare = analysis?.stockShare ?? 0;
  const limit = STOCK_SHARE_LIMIT[profile.riskLevel] ?? 0.6;
  let matchesProfile = true;
  if (stockShare > limit) {
    matchesProfile = false;
    const sev = stockShare > Math.min(limit + 0.2, 0.95) ? "critical" : "warn";
    grade = maxGrade(grade, sev === "critical" ? "high" : "medium");
    alerts.push({
      severity: sev,
      title: "投资组合股票集中度较高",
      detail: `发现你的投资组合股票占比 ${(stockShare * 100).toFixed(1)}%，超过${userRiskLabel}风险偏好的参考上限 ${(limit * 100).toFixed(0)}%，与你的风险承受能力不匹配。`,
    });
  }

  // 2) 单一持仓集中度（沿用组合分析结论）
  if (analysis && analysis.concentration !== "low") {
    grade = maxGrade(grade, analysis.concentration === "high" ? "high" : "medium");
  }

  // 3) 今日大跌持仓（验收测试 3）
  const sharpDrops = view.positions
    .filter((p) => (p.todayChangePct ?? 0) <= SHARP_DROP_PCT)
    .map((p) => ({
      name: p.name,
      code: p.code,
      todayChangePct: p.todayChangePct ?? 0,
    }));
  for (const d of sharpDrops) {
    const critical = d.todayChangePct <= SHARP_DROP_CRITICAL_PCT;
    grade = maxGrade(grade, critical ? "high" : "medium");
    alerts.push({
      severity: critical ? "critical" : "warn",
      title: `持仓「${d.name}」今日大幅下跌`,
      detail: `「${d.name}」今日下跌 ${Math.abs(d.todayChangePct).toFixed(2)}%，请关注仓位风险与止损纪律。`,
    });
  }

  // 4) 市场环境叠加（下行市场 + 高股票仓位 → 提升风险提示）
  if (market.trend === "down" && stockShare >= 0.5) {
    grade = maxGrade(grade, "medium");
    alerts.push({
      severity: "warn",
      title: "市场下行叠加较高权益仓位",
      detail: `${market.trendNote} 你的股票类仓位为 ${(stockShare * 100).toFixed(1)}%，短期波动可能加大。`,
    });
  }

  const summary =
    alerts.length === 0
      ? `组合风险与「${userRiskLabel}」偏好基本匹配，未发现显著风险暴露。`
      : `发现 ${alerts.length} 项风险信号（综合风险等级：${grade === "high" ? "高" : grade === "medium" ? "中" : "低"}），请查看明细并结合自身情况判断。`;

  return {
    riskGrade: grade,
    userRiskLabel,
    matchesProfile,
    alerts,
    sharpDrops,
    summary,
    computedAt: new Date().toISOString(),
    disclaimer: INVESTMENT_DISCLAIMER,
  };
}

/* -------------------------------------------------------------------------- */
/*  风险 → 通知中心（复用 Phase 6.8 通知设施）                                     */
/* -------------------------------------------------------------------------- */

/**
 * 将风险报告中的大跌 / 严重风险写入通知中心。
 * 返回实际推送数（经过 Policy 过滤 + 24h 去重）。
 */
export function pushRiskNotifications(
  userId: string,
  report: InvestmentRiskReport,
): { pushed: number; suppressed: number } {
  const candidates: ProactiveNotification[] = [];
  const now = Date.now();

  for (const a of report.alerts) {
    if (a.severity === "info") continue;
    candidates.push({
      id: newNotificationId(),
      userId,
      category: "risk",
      priority: a.severity === "critical" ? "high" : "medium",
      severity: a.severity === "critical" ? "critical" : "warn",
      title: a.title,
      reason: a.detail,
      suggestion: `${report.summary} ${INVESTMENT_DISCLAIMER}`,
      source: "market-monitor",
      read: false,
      dismissed: false,
      createdAt: now,
    });
  }

  if (candidates.length === 0) return { pushed: 0, suppressed: 0 };

  const settings = proactiveStore.getSettings(userId);
  const { accepted, suppressed } = applyNotificationPolicy(userId, settings, candidates);
  if (accepted.length > 0) proactiveStore.addNotifications(userId, accepted);
  return { pushed: accepted.length, suppressed };
}
