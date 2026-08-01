"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { Download, FileText } from "lucide-react";
import PageTransition from "@/components/dashboard/PageTransition";
import { useFinancialStore } from "@/store/financial-store";
import { generateSummary } from "@/summary/generate-summary";
import { projectWealth } from "@/lib/simulationEngine";
import { formatCurrency, formatPercent } from "@/lib/utils";

import ReportSection from "@/components/report/ReportSection";
import ActionItem from "@/components/report/ActionItem";
import NoFinancialData from "@/components/dashboard/NoFinancialData";
import GradientText from "@/components/ui/GradientText";
import { Button } from "@/components/ui/button";
import AllocationDonut from "@/components/charts/AllocationDonut";
import CashFlowBars from "@/components/charts/CashFlowBars";
import ProjectionCurve from "@/components/charts/ProjectionCurve";
import { Progress } from "@/components/ui/progress";
import RiskPill from "@/components/ui/RiskPill";

function handlePrint() {
  window.print();
}

export default function WealthReportPage() {
  const profile = useFinancialStore((s) => s.profile);
  const cashFlow = useFinancialStore((s) => s.cashFlow);
  const riskMetrics = useFinancialStore((s) => s.riskMetrics);
  const monthlyTrend = useFinancialStore((s) => s.monthlyTrend);
  const assetAllocation = useFinancialStore((s) => s.assetAllocation);
  const netWorth = useFinancialStore((s) => s.netWorth);
  const projection = useFinancialStore((s) => s.projection);
  const activeEvents = useFinancialStore((s) => s.activeEvents);
  const projectedRetireAge = useFinancialStore((s) => s.projectedRetireAge);
  const profileStatus = useFinancialStore((s) => s.profileStatus);
  const currentUserId = useFinancialStore((s) => s.currentUserId);
  const loadFinancialData = useFinancialStore((s) => s.loadFinancialData);

  // Phase 6.3 #221：报告页也拉取真实金融数据摘要，月度收支图优先使用真实流水
  useEffect(() => {
    if (currentUserId && profileStatus === "loaded") {
      loadFinancialData(currentUserId);
    }
  }, [currentUserId, profileStatus, loadFinancialData]);

  // Phase 5.9：未加载真实财富画像时，禁止生成任何财富报告 / 分析（避免默认数字与伪造结论）。
  if (profileStatus !== "loaded") {
    return (
      <PageTransition>
        <NoFinancialData
          title="你好，我还不了解你的财富情况"
          subtitle="创建你的财富画像后，AI CFO 才能基于你的真实数据生成专属财富报告与行动计划。"
        />
      </PageTransition>
    );
  }

  const summary = generateSummary({ profile, activeEvents });

  const optimisticProjection = projectWealth(profile, 30, {
    investmentReturn: 0.11,
    salaryGrowth: 0.07,
    extraExpense: profile.modifiers.extraExpense,
    extraIncome: profile.modifiers.extraIncome,
    extraInvestment: profile.modifiers.extraInvestment,
    extraReturn: profile.modifiers.extraReturn,
  });
  const pessimisticProjection = projectWealth(profile, 30, {
    investmentReturn: 0.05,
    salaryGrowth: 0.03,
    extraExpense: profile.modifiers.extraExpense,
    extraIncome: profile.modifiers.extraIncome,
    extraInvestment: profile.modifiers.extraInvestment,
    extraReturn: profile.modifiers.extraReturn,
  });

  const today = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const totalAssets =
    profile.cashSavings +
    profile.stockPortfolio +
    profile.realEstate +
    profile.bonds +
    profile.crypto +
    (profile.funds ?? 0) +
    (profile.house ?? 0) +
    (profile.insurance ?? 0);

  const emergencyMonths = cashFlow.expenses > 0
    ? profile.cashSavings / cashFlow.expenses
    : 0;

  return (
    <PageTransition>
      <div className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-start justify-between no-print"
        >
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-5 w-5 text-brand-electric" />
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-brand-electric/70">
                财富报告
              </p>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              <GradientText>{profile.name}</GradientText>
            </h1>
            <p className="mt-1 text-sm text-white/40">
              生成于 {today}
              {activeEvents.length > 0 && (
                <span className="ml-2 text-brand-purple">
                  · {activeEvents.length} 个激活情景
                </span>
              )}
            </p>
          </div>
          <Button onClick={handlePrint}>
            <Download className="h-4 w-4 mr-2" />
            导出 PDF
          </Button>
        </motion.div>

        {/* Print header */}
        <div className="hidden print:block mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            财富报告 — {profile.name}
          </h1>
          <p className="text-gray-500 mt-1">生成于 {today} · FinOS AI</p>
        </div>

        {/* Executive Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="glass rounded-2xl p-6 glow-ring"
        >
          <h2 className="text-lg font-semibold mb-4">执行摘要</h2>
          <p className="text-sm text-white/70 leading-relaxed mb-4">
            {summary.executiveSummary}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/40">净资产</p>
              <p className="text-xl font-bold numeric mt-1">{formatCurrency(netWorth)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/40">财务健康分</p>
              <p className="text-xl font-bold numeric mt-1 text-semantic-success">
                {riskMetrics.overall}/100
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/40">储蓄率</p>
              <p className="text-xl font-bold numeric mt-1 text-brand-electric">
                {formatPercent(cashFlow.savingsRate)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/40">预计退休年龄</p>
              <p className="text-xl font-bold numeric mt-1">{projectedRetireAge}</p>
            </div>
          </div>
        </motion.div>

        {/* Section 1: Asset Analysis */}
        <ReportSection number={1} title="资产分析" delay={0.15}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex justify-center">
              <AllocationDonut data={assetAllocation} size={200} />
            </div>
            <div className="space-y-3">
              {assetAllocation.map((asset) => (
                <div
                  key={asset.name}
                  className="flex items-center justify-between rounded-lg bg-white/[0.03] p-3"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ background: asset.color }}
                    />
                    <span className="text-sm text-white/70">{asset.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold numeric">
                      {formatCurrency(asset.value)}
                    </p>
                    <p className="text-[11px] text-white/40 numeric">
                      {((asset.value / totalAssets) * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-lg bg-white/[0.06] p-3 border border-white/10">
                <span className="text-sm font-medium">总资产</span>
                <span className="text-sm font-bold numeric">
                  {formatCurrency(totalAssets)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white/[0.03] p-3">
                <span className="text-sm text-white/50">负债</span>
                <span className="text-sm numeric text-semantic-risk">
                  -{formatCurrency(profile.liabilities)}
                </span>
              </div>
            </div>
          </div>
        </ReportSection>

        {/* Section 2: Cash Flow Analysis */}
        <ReportSection number={2} title="现金流分析" delay={0.2}>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="rounded-lg bg-white/[0.03] p-3">
              <p className="text-[10px] uppercase tracking-widest text-white/40">月收入</p>
              <p className="text-lg font-bold numeric text-semantic-success mt-1">
                {formatCurrency(cashFlow.income)}
              </p>
            </div>
            <div className="rounded-lg bg-white/[0.03] p-3">
              <p className="text-[10px] uppercase tracking-widest text-white/40">月支出</p>
              <p className="text-lg font-bold numeric text-semantic-risk mt-1">
                {formatCurrency(cashFlow.expenses)}
              </p>
            </div>
            <div className="rounded-lg bg-white/[0.03] p-3">
              <p className="text-[10px] uppercase tracking-widest text-white/40">储蓄率</p>
              <p className="text-lg font-bold numeric text-brand-electric mt-1">
                {formatPercent(cashFlow.savingsRate)}
              </p>
            </div>
          </div>
          <CashFlowBars data={monthlyTrend} height={180} />
          <p className="mt-3 text-xs text-white/40">近 6 个月收入与支出趋势</p>
        </ReportSection>

        {/* Section 3: Risk Analysis */}
        <ReportSection number={3} title="风险分析" delay={0.25}>
          <div className="space-y-4">
            {[
              { label: "债务风险", score: riskMetrics.debtRisk },
              { label: "投资风险", score: riskMetrics.investmentRisk },
              { label: "现金流风险", score: riskMetrics.cashFlowRisk },
            ].map((risk) => (
              <div key={risk.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-white/70">{risk.label}</span>
                  <RiskPill score={risk.score} />
                </div>
                <Progress
                  value={risk.score}
                  indicatorClassName={
                    risk.score < 30
                      ? "bg-semantic-success"
                      : risk.score < 60
                      ? "bg-semantic-warn"
                      : "bg-semantic-risk"
                  }
                />
              </div>
            ))}

            <div className="mt-5 rounded-lg bg-white/[0.03] p-4 border border-semantic-risk/10">
              <p className="text-sm font-medium text-white mb-3">压力测试情景</p>
              <div className="space-y-2 text-xs text-white/50">
                <div className="flex items-center justify-between">
                  <span>失业（连续 6 个月无收入）</span>
                  <span className={emergencyMonths >= 6 ? "text-semantic-success" : "text-semantic-warn"}>
                    应急金可覆盖 {emergencyMonths.toFixed(1)} 个月
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>市场暴跌（组合 -30%）</span>
                  <span className="text-semantic-warn">
                    组合损失：约 {formatCurrency(profile.stockPortfolio * 0.3)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>利率上升（+2%）</span>
                  <span className="text-white/60">影响有限（固定利率债务）</span>
                </div>
              </div>
            </div>

            {summary.warnings.length > 0 && (
              <div className="mt-4 rounded-lg bg-semantic-risk/10 border border-semantic-risk/20 p-4">
                <p className="text-sm font-medium text-semantic-risk mb-2">风险提示</p>
                {summary.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-white/60 leading-relaxed">
                    • {w}
                  </p>
                ))}
              </div>
            )}
          </div>
        </ReportSection>

        {/* Section 4: Future Projection */}
        <ReportSection number={4} title="未来预测" delay={0.3}>
          <div className="mb-2 flex gap-4 text-[11px] flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full bg-brand-electric" />
              基准
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full bg-semantic-success" />
              乐观
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full bg-semantic-risk" />
              悲观
            </span>
          </div>
          <ProjectionCurve
            data={projection}
            scenarioData={optimisticProjection}
            retirementAge={profile.goal.retirementAge}
            targetAmount={profile.goal.targetAmount}
            height={250}
          />
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-white/[0.03] p-3">
              <p className="text-[10px] uppercase text-white/40">乐观</p>
              <p className="text-sm font-bold numeric text-semantic-success">
                {formatCurrency(optimisticProjection[optimisticProjection.length - 1].assets)}
              </p>
            </div>
            <div className="rounded-lg bg-white/[0.06] p-3 border border-brand-electric/20">
              <p className="text-[10px] uppercase text-white/40">基准</p>
              <p className="text-sm font-bold numeric text-brand-electric">
                {formatCurrency(projection[projection.length - 1].assets)}
              </p>
            </div>
            <div className="rounded-lg bg-white/[0.03] p-3">
              <p className="text-[10px] uppercase text-white/40">悲观</p>
              <p className="text-sm font-bold numeric text-semantic-risk">
                {formatCurrency(Math.max(pessimisticProjection[pessimisticProjection.length - 1].assets, 0))}
              </p>
            </div>
          </div>
        </ReportSection>

        {/* Section 5: Action Plan */}
        <ReportSection number={5} title="推荐行动计划" delay={0.35}>
          <p className="text-xs text-white/40 mb-4">{summary.insights[0]}</p>
          <div className="space-y-3">
            {summary.actionItems.map((item, i) => (
              <ActionItem
                key={i}
                number={i + 1}
                title={item.title}
                description={item.description}
                impact={item.impact}
                delay={0.4 + i * 0.05}
              />
            ))}
          </div>
        </ReportSection>

        <div className="text-center py-6 text-xs text-white/30">
          <p>
            本报告由 FinOS AI 依据你已录入的财富数据生成 ·
            FinOS AI提供信息分析和辅助决策，不构成投资建议。
          </p>
        </div>
      </div>
    </PageTransition>
  );
}
