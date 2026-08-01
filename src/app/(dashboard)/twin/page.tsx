"use client";

import { useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import PageTransition from "@/components/dashboard/PageTransition";
import { useFinancialStore } from "@/store/financial-store";
import { scenarios } from "@/scenario/scenario-engine";
import { findRetirementAge } from "@/lib/simulationEngine";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { TwinSkeleton } from "@/components/skeletons";

// Phase 7.0.4 #306：ProjectionCurve 内含 recharts 重图表，按需懒加载（ssr:false + 骨架占位）
const ProjectionCurve = dynamic(
  () => import("@/components/charts/ProjectionCurve"),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[320px] w-full" />,
  },
);
import TimelineScrubber from "@/components/simulation/TimelineScrubber";
import LifeEventChip from "@/components/simulation/LifeEventChip";
import ScenarioDelta from "@/components/simulation/ScenarioDelta";
import WealthTimeline from "@/components/twin/WealthTimeline";
import AdvisorPanel from "@/components/twin/AdvisorPanel";
import GradientText from "@/components/ui/GradientText";
import { Button } from "@/components/ui/button";
import SectionHeader from "@/components/ui/SectionHeader";
import NoFinancialData from "@/components/dashboard/NoFinancialData";
import { RotateCcw, ArrowRight, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useTwinStatus, useRecalculateTwin, hasBackendToken } from "@/hooks/use-backend";

export default function DigitalTwinPage() {
  const profile = useFinancialStore((s) => s.profile);
  const projection = useFinancialStore((s) => s.projection);
  const baselineProjection = useFinancialStore((s) => s.baselineProjection);
  const activeEvents = useFinancialStore((s) => s.activeEvents);
  const projectedRetireAge = useFinancialStore((s) => s.projectedRetireAge);
  const toggleEvent = useFinancialStore((s) => s.toggleEvent);
  const resetScenario = useFinancialStore((s) => s.resetScenario);
  const twinSnapshot = useFinancialStore((s) => s.twinSnapshot);
  const advisorAlerts = useFinancialStore((s) => s.advisorAlerts);
  const lifeStage = useFinancialStore((s) => s.lifeStage);
  const wealthHealthScore = useFinancialStore((s) => s.wealthHealthScore);
  const loadUserProfile = useFinancialStore((s) => s.loadUserProfile);
  const runMonitor = useFinancialStore((s) => s.runMonitor);
  const isMonitoring = useFinancialStore((s) => s.isMonitoring);
  const goalProgress = useFinancialStore((s) => s.goalProgress);
  const currentUserId = useFinancialStore((s) => s.currentUserId);
  const profileStatus = useFinancialStore((s) => s.profileStatus);

  // ── Phase 7.0.2 追加：后端 Twin 引擎状态（独立数据通道，仅追加展示，不覆盖本地主指标）──
  const twinStatus = useTwinStatus();
  const recalcTwin = useRecalculateTwin();
  const backendTwin = (twinStatus.data ?? null) as Record<string, unknown> | null;
  const backendNetWorth =
    (backendTwin?.netWorth as number | undefined) ??
    (backendTwin?.net_worth as number | undefined);
  const backendHealth =
    ((backendTwin?.health as Record<string, unknown> | undefined)?.total as number | undefined) ??
    ((backendTwin?.wealthHealthScore as Record<string, unknown> | undefined)?.total as number | undefined);

  // Phase 5.9.1 / spec #6：打开 Twin 优先读取已缓存的快照（loadUserProfile 已带回 data.twin），
  // 不自动重算。重算仅在用户主动点击「重新计算」或数据变更时发生。
  useEffect(() => {
    if (!currentUserId) return;
    loadUserProfile(currentUserId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scenarioList = useMemo(
    () => Object.values(scenarios),
    []
  );

  // Phase 7.0.4 #306：未加载时区分「加载中/未知」与「真正空画像」。
  // 加载/未知态用骨架屏，真正空画像保留引导创建（避免闪烁到空状态）。
  if (profileStatus !== "loaded") {
    if (profileStatus === "empty") {
      return (
        <PageTransition>
          <NoFinancialData
            title="你好，我还不了解你的财富情况"
            subtitle="创建你的财富画像后，数字财富分身才能基于你的真实数据模拟未来轨迹与人生事件。"
          />
        </PageTransition>
      );
    }
    return (
      <PageTransition>
        <TwinSkeleton />
      </PageTransition>
    );
  }

  // Compute deltas for display
  const baselineComputedRetireAge = findRetirementAge(
    baselineProjection,
    profile.goal.targetAmount
  );

  const deltaRetirementYears = baselineComputedRetireAge - projectedRetireAge;
  const finalBaselineAssets = baselineProjection[baselineProjection.length - 1].assets;
  const finalScenarioAssets = projection[projection.length - 1].assets;
  const deltaAssets = finalScenarioAssets - finalBaselineAssets;

  const timelineAges = [25, 30, 35, 40, 45, 50, 55, projectedRetireAge]
    .filter((v, i, a) => a.indexOf(v) === i && v >= profile.age)
    .sort((a, b) => a - b);

  return (
    <PageTransition>
      <div className="space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-end justify-between gap-4"
        >
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-brand-purple/70 mb-2">
              财务数字孪生
            </p>
            <h1 className="text-4xl font-bold tracking-tight">
              <GradientText>模拟您的未来财富</GradientText>
            </h1>
            <p className="mt-2 text-sm text-white/40 max-w-2xl">
              切换人生决策，观察它们如何重塑您的财富轨迹。
              所有页面上的财富曲线都会实时联动变化。
            </p>
          </div>
          <button
            type="button"
            onClick={() => runMonitor({ runAgents: false })}
            disabled={isMonitoring}
            className="shrink-0 inline-flex items-center gap-2 rounded-full border border-brand-electric/30 bg-brand-electric/10 px-4 py-2 text-xs font-medium text-brand-electric transition hover:bg-brand-electric/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isMonitoring ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" /> 计算中…
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5" /> 重新计算
              </>
            )}
          </button>
        </motion.div>

        <div className="grid grid-cols-12 gap-6">
          {/* Left: Chart */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="col-span-7"
          >
            <div className="glass rounded-2xl p-6 glow-ring">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-white/60">财富轨迹</h3>
                  <p className="text-xs text-white/30 mt-0.5">
                    蓝色：基准 · 绿色：您的情景
                  </p>
                </div>
                <div className="flex gap-3 text-[11px]">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-4 rounded-full bg-brand-electric" />
                    基准
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-4 rounded-full bg-brand-purple" />
                    情景
                  </span>
                </div>
              </div>

              <motion.div
                key={activeEvents.join("-")}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <ProjectionCurve
                  data={baselineProjection}
                  scenarioData={activeEvents.length > 0 ? projection : undefined}
                  retirementAge={profile.goal.retirementAge}
                  targetAmount={profile.goal.targetAmount}
                  height={320}
                />
              </motion.div>

              <TimelineScrubber ages={timelineAges} selectedAge={projectedRetireAge} />
            </div>
          </motion.div>

          {/* Right: Controls */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="col-span-5 space-y-5"
          >
            <div className="glass rounded-2xl p-6">
              <SectionHeader
                eyebrow="人生事件"
                title="如果……？"
                subtitle="切换决策，观察您的未来在所有页面上的变化"
              />

              <div className="mt-5 grid grid-cols-1 gap-3">
                {scenarioList.map((event) => (
                  <LifeEventChip
                    key={event.id}
                    id={event.id}
                    label={event.label}
                    icon={event.icon}
                    description={event.description}
                    active={activeEvents.includes(event.id)}
                    onToggle={() => toggleEvent(event.id)}
                  />
                ))}
              </div>
            </div>

            {activeEvents.length > 0 && (
              <ScenarioDelta
                deltaAssets={deltaAssets}
                deltaRetirementYears={deltaRetirementYears}
                baselineRetireAge={baselineComputedRetireAge}
                scenarioRetireAge={projectedRetireAge}
              />
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={resetScenario} className="flex-1">
                <RotateCcw className="h-4 w-4 mr-2" />
                重置情景
              </Button>
              <Link href="/agents" className="flex-1">
                <Button className="w-full">
                  发送给智能体
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>

        {/* Phase 3.5：人生阶段 / 健康分 / 财富时间线 / 主动建议 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="grid grid-cols-12 gap-6"
        >
          <div className="col-span-7 space-y-4">
            <div className="glass rounded-2xl p-6">
              <SectionHeader
                eyebrow="财富时间线"
                title="过去 · 现在 · 未来"
                subtitle="你的财富轨迹关键节点"
              />
              <div className="mt-4">
                <WealthTimeline timeline={twinSnapshot?.timeline ?? []} />
              </div>
            </div>
          </div>
          <div className="col-span-5 space-y-4">
            <div className="glass rounded-2xl p-6">
              <SectionHeader eyebrow="AI 财富摘要" title="你的分身状态" />
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
                  <div className="text-[11px] text-white/40">人生阶段</div>
                  <div className="text-lg font-bold text-white">
                    {lifeStage || "—"}
                  </div>
                </div>
                <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
                  <div className="text-[11px] text-white/40">财富健康分</div>
                  <div className="text-lg font-bold text-white">
                    {wealthHealthScore ? `${wealthHealthScore.total}` : "—"}
                  </div>
                  {wealthHealthScore && (
                    <div className="text-[11px] text-brand-electric">
                      {wealthHealthScore.grade}
                    </div>
                  )}
                </div>
              </div>
              {twinSnapshot?.insight && (
                <p className="mt-3 text-xs text-white/60 leading-relaxed">
                  {twinSnapshot.insight}
                </p>
              )}
            </div>
            <div className="glass rounded-2xl p-6">
              <SectionHeader eyebrow="AI 主动提醒" title="Advisor" />
              <div className="mt-3">
                <AdvisorPanel alerts={advisorAlerts} />
              </div>
            </div>

            {/* Phase 7.0.2：后端 Twin 引擎（backendApi.twin.status，追加展示，不覆盖本地指标） */}
            <div className="glass rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <SectionHeader eyebrow="Backend Twin Engine" title="后端 Twin 引擎" />
                <button
                  type="button"
                  onClick={() => recalcTwin.mutate()}
                  disabled={!hasBackendToken() || recalcTwin.isPending}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-brand-purple/30 bg-brand-purple/10 px-3 py-1.5 text-[11px] font-medium text-brand-purple transition hover:bg-brand-purple/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {recalcTwin.isPending ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin" /> 重算中…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-3 w-3" /> 后端重算
                    </>
                  )}
                </button>
              </div>
              {!hasBackendToken() ? (
                <p className="mt-3 text-xs text-white/30">
                  未检测到后端 token，后端 Twin 通道未启用（本地分身仍正常）。登录后此处显示后端权威快照。
                </p>
              ) : twinStatus.isLoading ? (
                <p className="mt-3 text-xs text-white/30">连接后端 Twin 引擎…</p>
              ) : backendTwin ? (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
                    <div className="text-[11px] text-white/40">后端净资产</div>
                    <div className="text-lg font-bold text-white">
                      {typeof backendNetWorth === "number"
                        ? `¥${(backendNetWorth / 10000).toFixed(1)} 万`
                        : "—"}
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
                    <div className="text-[11px] text-white/40">后端健康分</div>
                    <div className="text-lg font-bold text-white">
                      {typeof backendHealth === "number" ? backendHealth : "—"}
                    </div>
                  </div>
                  <p className="col-span-2 text-[10px] text-white/30">
                    数据来自 FastAPI 后端 Twin 引擎（独立重算），与上方本地分身相互独立；后续待数据对齐后将成为权威源。
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-xs text-white/30">
                  后端尚未生成 Twin 快照。点击「后端重算」由 FastAPI 计算并保存。
                </p>
              )}
            </div>
          </div>
        </motion.div>

        {/* Phase 4：目标进度追踪（Goal Tracking） */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <div className="glass rounded-2xl p-6">
            <SectionHeader
              eyebrow="Goal Tracking"
              title="目标进度"
              subtitle="退休 / 买房 / 创业 / 教育等目标的实时完成度"
            />
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {(goalProgress.length > 0 ? goalProgress : []).map((g) => (
                <div
                  key={g.id}
                  className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/10"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white">{g.label}</span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] ${statusStyle(g.status)}`}
                    >
                      {statusLabel(g.status)}
                    </span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-brand"
                      style={{ width: `${g.progressPct}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-white/40">
                    <span>
                      {g.progressPct}% · ¥
                      {(g.currentAmount / 10000).toFixed(0)} 万 / ¥
                      {((g.targetAmount ?? 0) / 10000).toFixed(0)} 万
                    </span>
                    {g.targetYear && <span>目标 {g.targetYear} 年</span>}
                  </div>
                  <p className="mt-1.5 text-[11px] text-white/50">{g.note}</p>
                </div>
              ))}
              {goalProgress.length === 0 && (
                <p className="text-sm text-white/40">正在计算目标进度…</p>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </PageTransition>
  );
}

function statusStyle(status: string): string {
  switch (status) {
    case "on-track":
      return "bg-emerald-500/15 text-emerald-300";
    case "at-risk":
      return "bg-amber-500/15 text-amber-300";
    case "delayed":
      return "bg-rose-500/15 text-rose-300";
    case "achieved":
      return "bg-sky-500/15 text-sky-300";
    default:
      return "bg-white/10 text-white/60";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "on-track":
      return "进展顺利";
    case "at-risk":
      return "存在风险";
    case "delayed":
      return "已延期";
    case "achieved":
      return "已达成";
    default:
      return status;
  }
}
