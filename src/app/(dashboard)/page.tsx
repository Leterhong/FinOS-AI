"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  RefreshCw,
  Wallet,
  Sparkles,
  ShieldAlert,
  TrendingUp,
  Target,
  History,
  Brain,
  BookOpen,
  Bell,
  Shield,
  FlaskConical,
  ArrowRight,
  Lightbulb,
  ChevronDown,
} from "lucide-react";
import PageTransition from "@/components/dashboard/PageTransition";
import { useFinancialStore } from "@/store/financial-store";
import { useModelStore } from "@/store/model-store";
import { useAuthStore } from "@/store/auth-store";
import { timeAgo } from "@/lib/time";
import { formatCurrency, cn } from "@/lib/utils";
import {
  useTwinStatus,
  useCommandCenter,
  hasBackendToken,
} from "@/hooks/use-backend";
import BentoHealth from "@/components/bento/BentoHealth";
import BentoTotalAssets from "@/components/bento/BentoTotalAssets";
import BentoCashFlow from "@/components/bento/BentoCashFlow";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardSkeleton } from "@/components/skeletons";

// Phase 7.0.4 #306：BentoProjection 内含 recharts 重图表，按需懒加载（ssr:false + 骨架占位）
const BentoProjection = dynamic(
  () => import("@/components/bento/BentoProjection"),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[360px] w-full rounded-2xl" />,
  },
);
import BentoRisk from "@/components/bento/BentoRisk";
import BentoAgents from "@/components/bento/BentoAgents";
import BentoDailyBrief from "@/components/bento/BentoDailyBrief";
import BentoGoalProgress from "@/components/bento/BentoGoalProgress";
import BentoLifeTimeline from "@/components/bento/BentoLifeTimeline";
import BentoDataAssistant from "@/components/bento/BentoDataAssistant";
import BentoCompleteness from "@/components/bento/BentoCompleteness";
import BentoCFOCommand from "@/components/bento/BentoCFOCommand";
import BentoInvestmentHealth from "@/components/bento/BentoInvestmentHealth";
import EmptyProfileState from "@/components/dashboard/EmptyProfileState";
import GlassCard from "@/components/ui/GlassCard";
import { isEmptyProfile } from "@/data/types";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

/** 基于本地时间的动态问候（客户端渲染，登录后数据加载阶段才展示）。 */
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "凌晨好";
  if (h < 12) return "早上好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

/** Phase 7.3 快捷入口配置（Personal OS 六大模块） */
const QUICK_LINKS: {
  href: string;
  label: string;
  desc: string;
  icon: typeof History;
}[] = [
  { href: "/timeline", label: "财富时间线", desc: "过去 · 此刻 · 未来", icon: History },
  { href: "/memory", label: "AI 记忆中心", desc: "AI 记住的关于你", icon: Brain },
  { href: "/knowledge", label: "金融知识中心", desc: "你的私人知识库", icon: BookOpen },
  { href: "/wealth-lab", label: "财富实验室", desc: "情景模拟与推演", icon: FlaskConical },
  { href: "/notifications", label: "通知中心", desc: "财富 · 风险 · 目标", icon: Bell },
  { href: "/privacy-center", label: "数据控制中心", desc: "导出与记忆管理", icon: Shield },
];

const RISK_LEVEL_LABEL: Record<string, string> = {
  low: "低风险",
  medium: "中等风险",
  high: "高风险",
  critical: "高度承压",
};

export default function CommandCenterPage() {
  const profile = useFinancialStore((s) => s.profile);
  // Phase 6.7 需求十一：无真实数据时拦截「重新分析」，避免凭空生成财富分析
  const [blockMsg, setBlockMsg] = useState<string | null>(null);
  const [deepOpen, setDeepOpen] = useState(false);
  const cashFlow = useFinancialStore((s) => s.cashFlow);
  const riskMetrics = useFinancialStore((s) => s.riskMetrics);
  const projection = useFinancialStore((s) => s.projection);
  const monthlyTrend = useFinancialStore((s) => s.monthlyTrend);
  const netWorth = useFinancialStore((s) => s.netWorth);
  const projectedRetireAge = useFinancialStore((s) => s.projectedRetireAge);
  const loadUserProfile = useFinancialStore((s) => s.loadUserProfile);
  const runMonitor = useFinancialStore((s) => s.runMonitor);
  const isMonitoring = useFinancialStore((s) => s.isMonitoring);
  const currentUserId = useFinancialStore((s) => s.currentUserId);
  const profileStatus = useFinancialStore((s) => s.profileStatus);
  const lastSyncedAt = useFinancialStore((s) => s.lastSyncedAt);
  const loadFinancialData = useFinancialStore((s) => s.loadFinancialData);
  const financialSummary = useFinancialStore((s) => s.financialSummary);
  // Phase 6.5：最近一次 AI 分析时间（来自缓存，打开 Dashboard 不触发 LLM）
  const loadLatestAnalysis = useFinancialStore((s) => s.loadLatestAnalysis);
  const lastAnalysisAt = useFinancialStore((s) => s.lastAnalysisAt);
  const wealthHealthScore = useFinancialStore((s) => s.wealthHealthScore);
  const monitoring = useFinancialStore((s) => s.monitoring);

  // Phase 5.5：进入时加载当前用户的「激活模型 + 健康」，供 AI 状态展示
  const setModelUserId = useModelStore((s) => s.setUserId);
  const loadActiveModel = useModelStore((s) => s.loadActive);
  const active = useModelStore((s) => s.active);
  const cfoOnline = Boolean(active?.configured);
  // Phase 7.0.2 追加：后端 Twin 引擎连接状态（仅指示，不覆盖本地指标）
  const twinStatus = useTwinStatus();
  const backendTwinReady = hasBackendToken() && !twinStatus.isLoading && Boolean(twinStatus.data);

  // Phase 7.3：AI CFO 驾驶舱（后端 Personal OS 聚合）。追加式接入——
  // 后端有数据则优先展示，无数据时静默回落到本地 store，绝不把页面打空。
  const commandCenter = useCommandCenter();
  const cc = commandCenter.data;
  const ccToday = cc?.hasData ? cc.today : undefined;
  const ccDiscover = cc?.hasData ? cc.aiDiscover : undefined;
  const ccActions = cc?.hasData ? cc.actions : undefined;
  const ccRiskAlerts = cc?.hasData ? (cc.riskAlerts ?? []) : [];

  // 需求十一：无真实数据时拦截 AI 财富分析，提示用户先完善数据
  const handleAnalyze = () => {
    if (isEmptyProfile(profile)) {
      setBlockMsg("你的财富数据还未完善，请添加资产信息后开始分析。");
      return;
    }
    setBlockMsg(null);
    runMonitor({ runAgents: cfoOnline });
  };

  // Phase 5.6：当前会话用户（由 layout 的 loadMe 填充）
  const currentUser = useAuthStore((s) => s.currentUser);
  const status = useAuthStore((s) => s.status);

  // Phase 3.5/5.6：当前用户 id 变化时加载其专属画像 + Twin 快照
  useEffect(() => {
    const completed = useAuthStore.getState().currentUser?.profileCompleted;
    if (currentUserId && completed !== false) {
      loadUserProfile(currentUserId);
    }
  }, [currentUserId, loadUserProfile]);

  // Phase 5.9.1 / spec #7：Dashboard 仅读取用户数据与缓存指标，不自动运行 Monitor。
  useEffect(() => {
    if (currentUserId && profileStatus === "loaded") {
      loadFinancialData(currentUserId);
      setModelUserId(currentUserId);
      loadActiveModel(currentUserId);
      loadLatestAnalysis(currentUserId);
    }
  }, [
    currentUserId,
    profileStatus,
    loadFinancialData,
    setModelUserId,
    loadActiveModel,
    loadLatestAnalysis,
  ]);

  // ── 渲染分支：访客 / 加载中 / 空状态 / 已加载 ──
  if (status === "guest") {
    return (
      <PageTransition>
        <div className="flex min-h-[60vh] items-center justify-center text-white/50">
          正在跳转登录…
        </div>
      </PageTransition>
    );
  }

  if (currentUser?.profileCompleted === false || profileStatus === "empty") {
    return (
      <PageTransition>
        <EmptyProfileState />
      </PageTransition>
    );
  }

  if (
    status === "initial" ||
    status === "loading" ||
    profileStatus !== "loaded"
  ) {
    return (
      <PageTransition>
        <DashboardSkeleton />
      </PageTransition>
    );
  }

  // 已加载：个人欢迎区 + Phase 7.3 六区域 Bento Grid + 深度分析层
  const displayName = currentUser?.name || profile.name || "新用户";
  const greeting = getGreeting();
  const onTrack = projectedRetireAge <= profile.goal.retirementAge;
  const yearsEarlier = profile.goal.retirementAge - projectedRetireAge;

  // 后端优先，本地兜底
  const healthScore =
    ccToday?.healthScore ?? wealthHealthScore?.total ?? riskMetrics.overall;
  const healthGrade = wealthHealthScore?.grade;
  const healthDelta = ccToday?.healthScoreDelta ?? null;
  const displayNetWorth = ccToday?.netWorth ?? netWorth;

  // AI 扫描摘要（spec #2：今日发现的机会 / 风险数量）
  const localOpportunities =
    (monitoring?.briefing?.changes?.length ?? 0) +
    (monitoring?.alerts?.filter((a) => a.severity === "info").length ?? 0);
  const localRisks =
    monitoring?.alerts?.filter(
      (a) => a.severity === "warn" || a.severity === "critical"
    ).length ?? 0;
  const opportunities = ccDiscover?.opportunities?.length ?? localOpportunities;
  const risks =
    (ccDiscover?.anomalies?.length ?? 0) + ccRiskAlerts.length || localRisks;
  const hasScan = Boolean(monitoring);
  const hasAnalysis = hasScan || Boolean(lastAnalysisAt) || Boolean(cc?.hasData);

  // 总资产（与历史口径一致）
  const localTotalAssets =
    profile.cashSavings +
    profile.stockPortfolio +
    profile.realEstate +
    profile.bonds +
    profile.crypto +
    (profile.funds ?? 0) +
    (profile.house ?? 0) +
    (profile.insurance ?? 0);
  const totalAssets = ccToday?.totalAssets ?? localTotalAssets;

  const savingsRate = ccToday?.savingsRate ?? cashFlow.savingsRate;
  const disclaimer =
    ccToday?.disclaimer ??
    "FinOS AI提供信息分析和辅助决策，不构成投资建议。";

  return (
    <PageTransition>
      <div className="space-y-5 pb-2">
        {/* ── 指挥中心状态条（Phase 7.5 #362：问候 + 关键指标 + 操作合并为一条，压缩首屏空白）── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3"
        >
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight text-white xl:text-3xl">
              {greeting}，{displayName}
            </h1>
            <p className="mt-1 truncate text-xs text-white/45">
              {hasScan
                ? "AI CFO 已完成今日财富扫描"
                : lastAnalysisAt
                  ? `AI CFO 最近一次分析完成 · 数据更新于 ${timeAgo(lastSyncedAt)}`
                  : "财富驾驶舱已就绪，运行分析即可获取今日简报"}
            </p>
          </div>

          {/* 右侧：扫描摘要 + 数据源 + 模型状态 + 操作，单行排布 */}
          <div className="flex flex-wrap items-center gap-2">
            {hasAnalysis && (
              <>
                <StatusPill tone="neutral">
                  健康度 <b className="text-white">{healthScore}</b>
                </StatusPill>
                <StatusPill tone="info">{opportunities} 机会</StatusPill>
                <StatusPill tone="warn">{risks} 风险</StatusPill>
              </>
            )}

            <Link href="/data">
              <StatusPill tone={financialSummary?.hasData ? "success" : "muted"}>
                {financialSummary?.hasData
                  ? `真实数据 · ${financialSummary.transactionCount} 笔`
                  : "未接入数据 · 去导入"}
              </StatusPill>
            </Link>

            <Link href="/settings/models">
              <StatusPill tone={cfoOnline ? "success" : "warn"}>
                {cfoOnline ? `模型 ${active?.modelName}` : "未配置模型"}
              </StatusPill>
            </Link>

            {hasBackendToken() && (
              <StatusPill tone={backendTwinReady ? "success" : "muted"}>
                {backendTwinReady
                  ? "Twin 已连接"
                  : twinStatus.isLoading
                    ? "Twin 连接中…"
                    : "Twin 未就绪"}
              </StatusPill>
            )}

            <button
              type="button"
              onClick={handleAnalyze}
              disabled={isMonitoring}
              className="inline-flex items-center gap-1.5 rounded-lg border border-semantic-success/30 bg-semantic-success/10 px-3 py-1.5 text-xs font-medium text-semantic-success transition hover:bg-semantic-success/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", isMonitoring && "animate-spin")}
              />
              {isMonitoring ? "分析中…" : "重新分析"}
            </button>
          </div>

          {blockMsg && (
            <p className="w-full rounded-lg border border-amber-400/25 bg-amber-400/[0.08] px-3 py-1.5 text-[11px] text-amber-300">
              {blockMsg}
            </p>
          )}
        </motion.div>

        {/* ══ Phase 7.3 核心：六区域 Bento Grid ══ */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-12 gap-4 xl:gap-5"
        >
          {/* ① 财富总览 */}
          <div className="col-span-12 lg:col-span-5">
            <GlassCard className="h-full p-5" delay={0.05}>
              <SectionTitle icon={Wallet} title="财富总览" />
              <p className="mt-4 text-[11px] uppercase tracking-wide text-white/40">
                净资产
              </p>
              <p className="mt-0.5 text-3xl font-bold tracking-tight text-gradient-brand">
                {formatCurrency(displayNetWorth)}
              </p>
              <p className="mt-1 text-[11px] text-white/40">
                总资产 {formatCurrency(totalAssets)}
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <MiniStat
                  label="财富健康分"
                  value={String(healthScore)}
                  sub={
                    healthDelta !== null && healthDelta !== undefined
                      ? `${healthDelta >= 0 ? "+" : ""}${healthDelta} 较上次`
                      : healthGrade
                  }
                  // 涨红跌绿：健康分上升用红，下降用绿
                  tone={
                    healthDelta === null || healthDelta === undefined
                      ? "neutral"
                      : healthDelta >= 0
                        ? "up"
                        : "down"
                  }
                />
                <MiniStat
                  label="储蓄率"
                  value={`${Math.round(savingsRate * (savingsRate <= 1 ? 100 : 1))}%`}
                  sub="月度结余占比"
                />
                <MiniStat
                  label="应急储备"
                  value={
                    ccToday?.emergencyMonths !== null &&
                    ccToday?.emergencyMonths !== undefined
                      ? `${ccToday.emergencyMonths.toFixed(1)} 个月`
                      : "—"
                  }
                  sub="可覆盖支出月数"
                />
                <MiniStat
                  label="风险等级"
                  value={
                    ccToday?.riskLevel
                      ? (RISK_LEVEL_LABEL[ccToday.riskLevel] ?? ccToday.riskLevel)
                      : "—"
                  }
                  sub="综合承压评估"
                />
              </div>

              <p className="mt-5 border-t border-white/5 pt-3 text-[10px] leading-relaxed text-white/30">
                {disclaimer}
              </p>
            </GlassCard>
          </div>

          {/* ② AI CFO 建议 */}
          <div className="col-span-12 lg:col-span-4">
            <GlassCard className="h-full p-5" delay={0.1}>
              <SectionTitle icon={Sparkles} title="AI CFO 建议" />
              {ccActions ? (
                <div className="mt-4 space-y-4">
                  <ActionGroup
                    label="本周可做"
                    items={ccActions.week}
                    accent="text-semantic-success"
                  />
                  <ActionGroup
                    label="未来 3 个月"
                    items={ccActions.months}
                    accent="text-white/70"
                  />
                  <ActionGroup
                    label="长期"
                    items={ccActions.longTerm}
                    accent="text-white/50"
                  />
                </div>
              ) : (
                <EmptyHint
                  text="AI CFO 尚未生成行动建议"
                  hint="运行一次财富分析，AI 会给出本周 / 3 个月 / 长期的行动清单"
                />
              )}
            </GlassCard>
          </div>

          {/* ③ 风险监控 */}
          <div className="col-span-12 lg:col-span-3">
            <GlassCard className="h-full p-5" delay={0.15}>
              <SectionTitle icon={ShieldAlert} title="风险监控" />
              {ccRiskAlerts.length > 0 || (ccDiscover?.anomalies?.length ?? 0) > 0 ? (
                <div className="mt-4 space-y-2.5">
                  {ccDiscover?.anomalies?.map((a) => (
                    <div
                      key={a.id}
                      className={cn(
                        "rounded-xl border p-2.5",
                        a.severity === "critical"
                          ? "border-rose-400/25 bg-rose-400/[0.06]"
                          : a.severity === "warn"
                            ? "border-amber-400/25 bg-amber-400/[0.06]"
                            : "border-white/8 bg-white/[0.03]"
                      )}
                    >
                      <p className="text-xs font-medium text-white/90">
                        {a.title}
                      </p>
                      {a.body && (
                        <p className="mt-1 line-clamp-3 text-[10px] leading-snug text-white/40">
                          {a.body}
                        </p>
                      )}
                    </div>
                  ))}
                  {ccRiskAlerts.map((r, i) => (
                    <div
                      key={`alert-${i}`}
                      className="flex gap-2 rounded-xl border border-white/8 bg-white/[0.03] p-2.5"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                      <p className="text-[11px] leading-snug text-white/70">{r}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4">
                  <div className="rounded-xl border border-semantic-success/20 bg-semantic-success/[0.06] p-3">
                    <p className="text-xs text-semantic-success">
                      当前未发现明显风险
                    </p>
                    <p className="mt-1 text-[10px] leading-snug text-white/40">
                      AI CFO 会持续监控你的现金流、负债与投资集中度
                    </p>
                  </div>
                  <Link
                    href="/wealth-monitor"
                    className="mt-3 flex items-center justify-center gap-1 rounded-xl border border-white/8 bg-white/[0.02] py-2 text-[11px] text-white/50 transition hover:bg-white/[0.06] hover:text-white/80"
                  >
                    进入财富监控中心 <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              )}
            </GlassCard>
          </div>

          {/* ④ 财富趋势 */}
          <div className="col-span-12 lg:col-span-8">
            <div className="flex h-full flex-col gap-4 xl:gap-5">
              <BentoProjection
                data={projection}
                retirementAge={profile.goal.retirementAge}
                targetAmount={profile.goal.targetAmount}
                delay={0.2}
              />
              {(ccDiscover?.recentChanges?.length ?? 0) > 0 && (
                <GlassCard className="p-5" delay={0.25}>
                  <SectionTitle icon={TrendingUp} title="AI 发现的近期变化" />
                  <ul className="mt-3 space-y-2">
                    {ccDiscover?.recentChanges?.map((c, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-semantic-success" />
                        <span className="text-xs leading-relaxed text-white/70">
                          {c}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {(ccDiscover?.opportunities?.length ?? 0) > 0 && (
                    <div className="mt-4 border-t border-white/5 pt-3">
                      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-white/40">
                        <Lightbulb className="h-3 w-3" /> 潜在机会
                      </p>
                      <ul className="mt-2 space-y-1.5">
                        {ccDiscover?.opportunities?.map((o, i) => (
                          <li
                            key={i}
                            className="text-[11px] leading-relaxed text-brand-electric/90"
                          >
                            · {o}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </GlassCard>
              )}
            </div>
          </div>

          {/* ⑤ 目标进度 */}
          <div className="col-span-12 lg:col-span-4">
            <div className="flex h-full flex-col gap-4 xl:gap-5">
              <BentoGoalProgress delay={0.3} />
              <GlassCard className="p-5" delay={0.35}>
                <SectionTitle icon={Target} title="退休目标" />
                <p className="mt-3 text-2xl font-bold text-white">
                  {profile.goal.retirementAge} 岁
                </p>
                <p
                  className={cn(
                    "mt-1 text-xs",
                    onTrack ? "text-semantic-success" : "text-amber-300"
                  )}
                >
                  {onTrack
                    ? `按当前节奏可提前 ${Math.abs(yearsEarlier)} 年达标`
                    : `按当前节奏存在 ${Math.abs(yearsEarlier)} 年缺口`}
                </p>
                <p className="mt-2 text-[11px] text-white/40">
                  目标金额 {formatCurrency(profile.goal.targetAmount)}
                </p>
              </GlassCard>
            </div>
          </div>

          {/* ⑥ 快捷入口 */}
          <div className="col-span-12">
            <GlassCard className="p-5" delay={0.4}>
              <SectionTitle icon={ArrowRight} title="快捷入口" />
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                {QUICK_LINKS.map((l) => {
                  const Icon = l.icon;
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      className="group rounded-xl border border-white/8 bg-white/[0.02] p-3 transition-colors hover:border-semantic-success/25 hover:bg-white/[0.05]"
                    >
                      <Icon className="h-4 w-4 text-white/50 transition-colors group-hover:text-semantic-success" />
                      <p className="mt-2 text-xs font-medium text-white/90">
                        {l.label}
                      </p>
                      <p className="mt-0.5 text-[10px] leading-snug text-white/35">
                        {l.desc}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </GlassCard>
          </div>
        </motion.div>

        {/* ══ 深度分析层（原有能力全部保留，默认折叠避免首屏过载）══ */}
        <div>
          <button
            type="button"
            onClick={() => setDeepOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-2xl border border-white/8 bg-white/[0.02] px-5 py-3 transition-colors hover:bg-white/[0.05]"
          >
            <span className="text-sm font-medium text-white/80">
              深度分析
              <span className="ml-2 text-[11px] text-white/35">
                健康度拆解 · 现金流 · 简报 · 时间线 · 智能体 · 投资健康
              </span>
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-white/40 transition-transform",
                deepOpen && "rotate-180"
              )}
            />
          </button>

          {deepOpen && (
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="mt-4 grid grid-cols-12 gap-4 auto-rows-[minmax(160px,auto)] xl:gap-5"
            >
              <div className="col-span-12 md:col-span-3">
                <BentoHealth
                  score={healthScore}
                  debtRisk={riskMetrics.debtRisk}
                  investmentRisk={riskMetrics.investmentRisk}
                  cashFlowRisk={riskMetrics.cashFlowRisk}
                  delay={0.05}
                />
              </div>
              <div className="col-span-12 flex flex-col gap-4 md:col-span-3 xl:gap-5">
                <BentoTotalAssets
                  totalAssets={localTotalAssets}
                  netWorth={netWorth}
                  delay={0.1}
                />
                <BentoCashFlow
                  income={cashFlow.income}
                  expenses={cashFlow.expenses}
                  savingsRate={cashFlow.savingsRate}
                  trend={monthlyTrend}
                  delay={0.15}
                />
              </div>
              <div className="col-span-12 md:col-span-6">
                <BentoDailyBrief delay={0.2} />
              </div>

              <div className="col-span-12 md:col-span-3">
                <BentoRisk
                  risks={[
                    { label: "债务风险", score: riskMetrics.debtRisk },
                    { label: "投资风险", score: riskMetrics.investmentRisk },
                    { label: "现金流风险", score: riskMetrics.cashFlowRisk },
                  ]}
                  delay={0.25}
                />
              </div>
              <div className="col-span-12 md:col-span-5">
                <BentoLifeTimeline delay={0.3} />
              </div>
              <Link
                href="/agents"
                className="col-span-12 block transition-opacity hover:opacity-95 md:col-span-4"
              >
                <BentoAgents delay={0.35} />
              </Link>

              <div className="col-span-12 md:col-span-3">
                <BentoCFOCommand delay={0.4} />
              </div>
              <div className="col-span-12 md:col-span-3">
                <BentoInvestmentHealth delay={0.45} />
              </div>
              <div className="col-span-12 md:col-span-3">
                <BentoDataAssistant delay={0.5} />
              </div>
              <div className="col-span-12 md:col-span-3">
                <BentoCompleteness delay={0.55} />
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}

/* ─────────────── 局部子组件 ─────────────── */

/** Phase 7.5 #362：统一状态胶囊，替代原先四种各写一遍的内联样式。 */
const PILL_TONE = {
  neutral: "border-white/10 bg-white/[0.05] text-white/65",
  muted: "border-white/8 bg-white/[0.03] text-white/40 hover:bg-white/[0.06]",
  info: "border-brand-electric/25 bg-brand-electric/10 text-brand-electric",
  success:
    "border-semantic-success/25 bg-semantic-success/10 text-semantic-success",
  warn: "border-amber-400/25 bg-amber-400/10 text-amber-300",
} as const;

function StatusPill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: keyof typeof PILL_TONE;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
        PILL_TONE[tone]
      )}
    >
      {children}
    </span>
  );
}

function SectionTitle({
  icon: Icon,
  title,
}: {
  icon: typeof Wallet;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/8 bg-white/[0.04]">
        <Icon className="h-3.5 w-3.5 text-semantic-success" />
      </span>
      <h2 className="text-sm font-semibold text-white">{title}</h2>
    </div>
  );
}

function MiniStat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "up" | "down";
}) {
  return (
    <div className="rounded-xl border border-white/6 bg-white/[0.02] p-3">
      <p className="text-[10px] uppercase tracking-wide text-white/35">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
      {sub && (
        <p
          className={cn(
            "mt-0.5 text-[10px]",
            // 涨红跌绿（中国习惯）
            tone === "up"
              ? "text-rose-300"
              : tone === "down"
                ? "text-semantic-success"
                : "text-white/35"
          )}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

function ActionGroup({
  label,
  items,
  accent,
}: {
  label: string;
  items: string[];
  accent: string;
}) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-white/35">
        {label}
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-white/25" />
            <span className={cn("text-[11px] leading-relaxed", accent)}>
              {it}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyHint({ text, hint }: { text: string; hint: string }) {
  return (
    <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.02] p-4">
      <p className="text-xs text-white/55">{text}</p>
      <p className="mt-1.5 text-[10px] leading-snug text-white/30">{hint}</p>
    </div>
  );
}
