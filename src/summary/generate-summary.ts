import type { FinancialProfile } from "@/data/types";
import type { AgentAnalysis, AgentMetric } from "@/agents/types";
import { computeCashFlow, computeRiskMetrics } from "@/scenario/scenario-engine";
import { findRetirementAge, projectWealth } from "@/lib/simulationEngine";
import { formatCurrency, formatPercent } from "@/lib/utils";

interface SummaryInput {
  profile: FinancialProfile;
  activeEvents: string[];
}

interface ActionItem {
  title: string;
  description: string;
  impact: string;
}

interface SummaryResult {
  executiveSummary: string;
  insights: string[];
  actionItems: ActionItem[];
  warnings: string[];
}

export function generateSummary(input: SummaryInput): SummaryResult {
  const { profile, activeEvents } = input;
  const cashFlow = computeCashFlow(profile);
  const riskMetrics = computeRiskMetrics(profile);
  const projection = projectWealth(profile, 30, {
    extraExpense: profile.modifiers.extraExpense,
    extraIncome: profile.modifiers.extraIncome,
    extraInvestment: profile.modifiers.extraInvestment,
    extraReturn: profile.modifiers.extraReturn,
  });
  const projectedRetireAge = findRetirementAge(projection, profile.goal.targetAmount);
  const onTrack = projectedRetireAge <= profile.goal.retirementAge;
  const netWorth =
    profile.cashSavings +
    profile.stockPortfolio +
    profile.realEstate +
    profile.bonds +
    profile.crypto +
    profile.funds +
    profile.house +
    profile.insurance -
    profile.liabilities;

  // ── Executive Summary ──────────────────────────────────────────────────
  const eventsApplied = activeEvents.length > 0
    ? ` 已激活 ${activeEvents.length} 个人生事件，`
    : " ";

  const executiveSummary =
    `${profile.name}，年龄 ${profile.age}，财务健康分为 ${riskMetrics.overall}/100，` +
    `净资产为 ${formatCurrency(netWorth)}。${eventsApplied}` +
    `当前轨迹${onTrack ? "可达成" : "将晚于"} ${profile.goal.retirementAge} 岁的退休目标。` +
    `预计退休年龄为 ${projectedRetireAge}，储蓄率为 ${formatPercent(cashFlow.savingsRate)}。`;

  // ── Insights ───────────────────────────────────────────────────────────
  const insights: string[] = [];

  insights.push(
    `当前储蓄率为 ${formatPercent(cashFlow.savingsRate)}，${
      cashFlow.savingsRate > 30 ? "处于同龄人前 25%" :
      cashFlow.savingsRate > 20 ? "高于建议的 20% 基准线" :
      "低于建议基准线——建议控制支出"
    }。`
  );

  const emergencyMonths = cashFlow.expenses > 0
    ? profile.cashSavings / cashFlow.expenses
    : 0;
  insights.push(
    `应急金可覆盖 ${emergencyMonths.toFixed(1)} 个月支出——${
      emergencyMonths >= 6 ? "缓冲充足" :
      emergencyMonths >= 3 ? "基本充足，建议积累至 6 个月" :
      "不足，应优先建立现金储备"
    }。`
  );

  if (onTrack) {
    insights.push(
      `您正按计划于 ${projectedRetireAge} 岁退休，比目标提前 ${profile.goal.retirementAge - projectedRetireAge} 年。` +
      `目标退休年龄时的预计净资产为 ${formatCurrency(
        projection.find((p) => p.age === profile.goal.retirementAge)?.assets ??
          projection[projection.length - 1].assets
      )}。`
    );
  } else {
    insights.push(
      `当前轨迹预计 ${projectedRetireAge} 岁退休，比目标晚 ${projectedRetireAge - profile.goal.retirementAge} 年。` +
      `每月增加 ¥2,000-5,000 投资可弥合该缺口。`
    );
  }

  const equityRatio =
    (profile.stockPortfolio + profile.crypto + profile.funds) /
    Math.max(
      profile.cashSavings +
        profile.stockPortfolio +
        profile.realEstate +
        profile.bonds +
        profile.crypto +
        profile.funds,
      1
    );
  if (equityRatio > 0.6 && profile.age < 45) {
    insights.push(
      `股票类资产占比 ${(equityRatio * 100).toFixed(0)}%，属于进取型配置，与您的年龄相匹配，具备较高增长潜力。`
    );
  }

  if (activeEvents.length > 0) {
    insights.push(
      `当前已激活人生情景，正在改变您的财富轨迹——可关闭情景以与基准对比。`
    );
  }

  // ── Action Items ───────────────────────────────────────────────────────
  const actionItems: ActionItem[] = [];

  if (cashFlow.savingsRate < 30) {
    actionItems.push({
      title: "提高每月投资比例",
      description: `当前储蓄率 ${formatPercent(cashFlow.savingsRate)} 低于早期财富积累的 30%+ 最优水平。`,
      impact: onTrack ? "提前 2-4 年退休" : "弥合退休缺口",
    });
  }

  if (emergencyMonths < 6 && emergencyMonths > 0) {
    actionItems.push({
      title: "将应急金积累至 6 个月",
      description: `当前仅覆盖 ${emergencyMonths.toFixed(1)} 个月，难以抵御收入中断风险。`,
      impact: "提升财务韧性",
    });
  }

  if (profile.liabilities > profile.cashSavings * 2) {
    actionItems.push({
      title: "加速偿还债务",
      description: `负债 ${formatCurrency(profile.liabilities)} 相对现金储备过高，存在风险敞口。`,
      impact: "降低利息成本与风险",
    });
  }

  if (profile.age < 45 && equityRatio < 0.5) {
    actionItems.push({
      title: "提高股票类资产配置",
      description: "结合您的年龄区间，更高的股票敞口有助于长期复利增长。",
      impact: "预期年化收益 +1-2%",
    });
  }

  actionItems.push({
    title: "检视保险保障",
    description: "确保拥有充足的医疗、人寿与失能保障，以守护财富轨迹。",
    impact: "风险对冲",
  });

  // Ensure at least 5 items
  while (actionItems.length < 5) {
    actionItems.push({
      title: "拓展收入来源",
      description: "考虑通过副业收入或被动投资工具加速财富积累。",
      impact: "增强财务安全垫",
    });
  }

  // ── Warnings ───────────────────────────────────────────────────────────
  const warnings: string[] = [];

  if (riskMetrics.cashFlowRisk > 40) {
    warnings.push("现金流风险偏高——建议降低月度支出或建立储备。");
  }
  if (riskMetrics.debtRisk > 50) {
    warnings.push("负债收入比偏高——应在增加投资前优先降低债务。");
  }
  if (profile.liabilities > netWorth * 0.5) {
    warnings.push("负债超过净资产的 50%——杠杆风险显著。");
  }
  if (cashFlow.savingsRate < 15) {
    warnings.push("储蓄率过低——长期财富积累面临风险。");
  }

  return {
    executiveSummary,
    insights: insights.slice(0, 4),
    actionItems: actionItems.slice(0, 5),
    warnings,
  };
}

// ── As AgentAnalysis for compatibility ─────────────────────────────────────

export function generateSummaryAnalysis(input: SummaryInput): AgentAnalysis {
  const summary = generateSummary(input);
  const isOnTrack =
    findRetirementAge(
      projectWealth(input.profile, 30, {
        extraExpense: input.profile.modifiers.extraExpense,
        extraIncome: input.profile.modifiers.extraIncome,
        extraInvestment: input.profile.modifiers.extraInvestment,
        extraReturn: input.profile.modifiers.extraReturn,
      }),
      input.profile.goal.targetAmount
    ) <= input.profile.goal.retirementAge;

  const metrics: AgentMetric[] = [
    {
      label: "健康分",
      value: `${computeRiskMetrics(input.profile).overall}/100`,
      tone: "good",
    },
    {
      label: "退休准备度",
      value: isOnTrack ? "已达标" : "存在缺口",
      tone: isOnTrack ? "good" : "warn",
    },
    { label: "激活事件", value: `${input.activeEvents.length}` },
  ];

  return {
    agent: "summary",
    headline: summary.executiveSummary,
    bullets: summary.insights,
    metrics,
    confidence: 0.92,
  };
}
