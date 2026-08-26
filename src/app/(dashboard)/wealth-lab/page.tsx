"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import PageTransition from "@/components/dashboard/PageTransition";
import GlassCard from "@/components/ui/GlassCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import HealthRing from "@/components/charts/HealthRing";
import ScoreRadar from "@/components/intelligence/ScoreRadar";
import WealthProjectionChart from "@/components/intelligence/WealthProjectionChart";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import {
  useWealthPredict,
  useWealthScore,
  useWealthEvents,
  useSimulate,
  useComparePlans,
  useWealthWorkflow,
} from "@/hooks/use-backend";
import type {
  WealthPredict,
  WealthScore,
  CatalogEvent,
  SimulateResult,
  CompareResult,
  WorkflowResult,
  Explanation,
  ImpactMap,
} from "@/types/intelligence";
import {
  FlaskConical,
  Radar,
  TrendingUp,
  ArrowRight,
  Sparkles,
  AlertTriangle,
  Target,
  Wallet,
  ShieldCheck,
  GitCompareArrows,
  Brain,
  RefreshCw,
} from "lucide-react";

const DISCLAIMER = "FinOS AI提供信息分析和辅助决策，不构成投资建议。";

const IMPACT_LABELS: Record<string, string> = {
  netWorth: "净资产",
  monthlySurplus: "月结余",
  netWorth1y: "1 年后净资产",
  netWorth5y: "5 年后净资产",
  netWorth10y: "10 年后净资产",
  healthScore: "财富健康分",
  goalProbability: "目标达成概率",
  retirementGap: "退休资金缺口",
  emergencyMonths: "应急金覆盖月数",
};

function tierBadge(tier?: string) {
  if (tier === "local")
    return <StatusBadge tone="neutral">本地规则生成</StatusBadge>;
  if (tier === "light")
    return <StatusBadge tone="info">轻量模型生成</StatusBadge>;
  if (tier === "ai" || tier === "full")
    return <StatusBadge tone="success">AI 模型生成</StatusBadge>;
  return <StatusBadge tone="neutral">规则生成</StatusBadge>;
}

export default function WealthLabPage() {
  const [goalForm, setGoalForm] = useState({ retirementAge: 60, goalAmount: "", goalYears: "" });
  const [appliedGoal, setAppliedGoal] = useState<{
    retirementAge: number;
    goalAmount: number | null;
    goalYears: number | null;
  }>({ retirementAge: 60, goalAmount: null, goalYears: null });

  const predictQ = useWealthPredict(appliedGoal);
  const scoreQ = useWealthScore();
  const eventsQ = useWealthEvents();

  // 工作流状态提升到页面级：按钮与结果面板必须共享同一个 mutation 实例，
  // 否则各自 useWealthWorkflow() 会得到互相独立的实例，面板永远读不到结果。
  const workflow = useWealthWorkflow();
  const [workflowResult, setWorkflowResult] = useState<WorkflowResult | null>(null);

  const runWorkflow = async () => {
    try {
      const data = (await workflow.mutateAsync({ question: "", useAi: true })) as WorkflowResult;
      setWorkflowResult(data);
    } catch {
      /* 错误由 query 层抛出，页面保持现状 */
    }
  };

  const predict = predictQ.data as WealthPredict | undefined;
  const score = scoreQ.data as WealthScore | undefined;
  const events = (eventsQ.data as { events?: CatalogEvent[] } | undefined)?.events ?? [];

  const loading = predictQ.isLoading || scoreQ.isLoading;
  const hasData = predict?.hasData === true;

  return (
    <PageTransition>
      <div className="space-y-7">
        {/* 页头 */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-wrap items-end justify-between gap-4"
        >
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-brand shadow-glow-blue">
                <FlaskConical className="h-4 w-4 text-white" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-white">财富实验室</h1>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-white/55">
              基于你的真实财富数据，推演未来资产轨迹、模拟人生重大事件的影响、对比不同决策方案，
              并由多 Agent 协作给出可解释的财富建议。
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/5 px-3 py-1.5 text-[11px] text-amber-300/90 sm:inline-flex">
              <AlertTriangle className="h-3 w-3" /> 测算结果仅供参考
            </span>
            <WorkflowButton onRun={runWorkflow} pending={workflow.isPending} />
          </div>
        </motion.div>

        {/* 免责声明横幅 */}
        <div className="flex items-start gap-2.5 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300/80" />
          <p className="text-[12px] leading-relaxed text-white/55">
            {DISCLAIMER}所有预测与模拟均基于你录入的真实数据，采用确定性复利与蒙特卡洛概率模型计算，
            不保证收益、不提供具体投资标的、不自动执行交易。
          </p>
        </div>

        {loading ? (
          <LoadingState />
        ) : !hasData ? (
          <NoDataState />
        ) : (
          <>
            {/* 评分 + 雷达 + 目标设置 */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <Section title="财富健康分" icon={<ShieldCheck className="h-4 w-4" />}>
                <div className="flex flex-col items-center">
                  <HealthRing
                    score={score?.totalScore ?? 0}
                    label="健康分"
                    sublabel={score?.level}
                  />
                  <div className="mt-3 flex flex-wrap justify-center gap-2 text-[11px]">
                    {score?.weakest && (
                      <span className="rounded-md bg-rose-400/10 px-2 py-0.5 text-rose-300">
                        最弱：{score.weakest.label} {score.weakest.score}
                      </span>
                    )}
                    {score?.strongest && (
                      <span className="rounded-md bg-emerald-400/10 px-2 py-0.5 text-emerald-300">
                        最强：{score.strongest.label} {score.strongest.score}
                      </span>
                    )}
                  </div>
                </div>
              </Section>

              <Section title="六维评分雷达" icon={<Radar className="h-4 w-4" />}>
                {score?.dimensions ? (
                  <ScoreRadar dimensions={score.dimensions} />
                ) : (
                  <EmptyHint text="评分数据加载中…" />
                )}
              </Section>

              <Section
                title="目标设置"
                icon={<Target className="h-4 w-4" />}
                hint="影响退休与目标达成概率测算"
              >
                <GoalSetter
                  form={goalForm}
                  onChange={setGoalForm}
                  onApply={() =>
                    setAppliedGoal({
                      retirementAge: Number(goalForm.retirementAge) || 60,
                      goalAmount: goalForm.goalAmount ? Number(goalForm.goalAmount) : null,
                      goalYears: goalForm.goalYears ? Number(goalForm.goalYears) : null,
                    })
                  }
                  applied={appliedGoal}
                />
              </Section>
            </div>

            {/* 轨迹 + 关键指标 */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Section
                title="财富轨迹推演"
                icon={<TrendingUp className="h-4 w-4" />}
                hint={predict?.cached ? "预测缓存" : "实时测算"}
              >
                {predict?.series?.length ? (
                  <WealthProjectionChart
                    series={predict.series}
                    currentAge={predict.current?.age}
                    retirementAge={predict.retirement?.available ? predict.retirement.retirementAge : undefined}
                    targetAmount={predict.goal?.targetAmount}
                  />
                ) : (
                  <EmptyHint text="暂无轨迹数据" />
                )}
              </Section>

              <Section title="关键指标" icon={<Wallet className="h-4 w-4" />}>
                <KeyMetrics predict={predict} score={score} />
              </Section>
            </div>

            {/* 人生事件模拟 */}
            <EventSimulator events={events} />

            {/* 方案对比 */}
            <PlanCompare events={events} />

            {/* AI 财富顾问工作流 */}
            <WorkflowPanel result={workflowResult} pending={workflow.isPending} />
          </>
        )}

        <p className="pt-2 text-center text-[11px] text-white/30">{DISCLAIMER}</p>
      </div>
    </PageTransition>
  );
}

/* ───────────────────────── 子组件 ───────────────────────── */

function Section({
  title,
  icon,
  hint,
  action,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <GlassCard className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-brand-electric">{icon}</span>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {hint && <span className="text-[11px] text-white/35">{hint}</span>}
          {action}
        </div>
      </div>
      {children}
    </GlassCard>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-xl bg-white/[0.02] py-8 text-center text-sm text-white/40 ring-1 ring-white/10">
      {text}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <GlassCard key={i} className="h-64 animate-pulse p-5">
          <div className="h-full rounded-xl bg-white/[0.03]" />
        </GlassCard>
      ))}
    </div>
  );
}

function NoDataState() {
  return (
    <GlassCard className="p-12 text-center">
      <FlaskConical className="mx-auto h-9 w-9 text-white/20" />
      <p className="mt-4 text-base font-medium text-white">尚未创建财富数字分身</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
        财富实验室需要基于你的真实财富数据推演。请先完善财富档案，AI 才能开始预测与模拟。
      </p>
      <a
        href="/onboarding"
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-brand px-5 py-2.5 text-sm font-medium text-white shadow-glow-blue transition hover:opacity-90"
      >
        <Sparkles className="h-4 w-4" /> 创建财富数字分身
      </a>
    </GlassCard>
  );
}

function GoalSetter({
  form,
  onChange,
  onApply,
  applied,
}: {
  form: { retirementAge: number; goalAmount: string; goalYears: string };
  onChange: (v: typeof form) => void;
  onApply: () => void;
  applied: { retirementAge: number; goalAmount: number | null; goalYears: number | null };
}) {
  return (
    <div className="space-y-3">
      <Field label="目标退休年龄">
        <input
          type="number"
          value={form.retirementAge}
          onChange={(e) => onChange({ ...form, retirementAge: Number(e.target.value) })}
          className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-brand-electric/40"
        />
      </Field>
      <Field label="财富目标金额（元，可选）">
        <input
          type="number"
          placeholder="如 5000000"
          value={form.goalAmount}
          onChange={(e) => onChange({ ...form, goalAmount: e.target.value })}
          className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-brand-electric/40"
        />
      </Field>
      <Field label="目标期限（年，可选）">
        <input
          type="number"
          placeholder="如 10"
          value={form.goalYears}
          onChange={(e) => onChange({ ...form, goalYears: e.target.value })}
          className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-brand-electric/40"
        />
      </Field>
      <button
        type="button"
        onClick={onApply}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-brand py-2 text-xs font-medium text-white shadow-glow-blue transition hover:opacity-90"
      >
        <RefreshCw className="h-3.5 w-3.5" /> 重新测算
      </button>
      <p className="text-[11px] text-white/35">
        当前生效：退休 {applied.retirementAge} 岁
        {applied.goalAmount ? ` · 目标 ${formatCurrency(applied.goalAmount)}` : ""}
        {applied.goalYears ? ` · ${applied.goalYears} 年` : ""}
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-white/45">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function KeyMetrics({ predict, score }: { predict?: WealthPredict; score?: WealthScore }) {
  void score;
  const ret = predict?.retirement;
  const goal = predict?.goal;
  const cf = predict?.cashflow;
  const rows: { label: string; value: string; tone?: string }[] = [];
  rows.push({
    label: "当前净资产",
    value: formatCurrency(predict?.current?.netWorth ?? 0),
  });
  if (ret?.available) {
    rows.push({
      label: "退休资金缺口",
      value: ret.covered ? "已覆盖 ✓" : formatCurrency(ret.gap ?? 0),
      tone: ret.covered ? "text-semantic-success" : "text-rose-400",
    });
    if (!ret.covered && ret.extraMonthlySavingNeeded) {
      rows.push({
        label: "每月需额外储蓄",
        value: formatCurrency(ret.extraMonthlySavingNeeded),
      });
    }
  }
  if (goal?.available) {
    rows.push({
      label: "目标达成概率",
      value: `${formatPercent((goal.probability ?? 0) * 100)}（${goal.probabilityLabel}）`,
      tone: (goal.probability ?? 0) >= 0.6 ? "text-semantic-success" : "text-amber-300",
    });
  }
  rows.push({
    label: "储蓄率",
    value: formatPercent((predict?.current?.savingsRate ?? 0) * 100),
  });
  if (cf?.breakEvenYear) {
    rows.push({
      label: "结余转负拐点",
      value: `第 ${cf.breakEvenYear} 年`,
      tone: "text-amber-300",
    });
  } else {
    rows.push({ label: "现金流", value: "预测期持续为正", tone: "text-semantic-success" });
  }

  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between text-sm">
          <span className="text-white/50">{r.label}</span>
          <span className={cn("font-medium", r.tone ?? "text-white")}>{r.value}</span>
        </div>
      ))}
      <p className="pt-1 text-[11px] leading-snug text-white/35">{cf?.note}</p>
    </div>
  );
}

function ExplanationBlock({ exp, title }: { exp: Explanation; title?: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/10">
      <div className="flex flex-wrap items-center gap-2">
        {title && <span className="text-xs font-semibold text-white">{title}</span>}
        {tierBadge(exp.tier)}
      </div>
      <ThreeSection label="原因" items={exp.cause} />
      <ThreeSection label="影响" items={exp.impact} />
      <ThreeSection label="建议" items={exp.advice} tone="text-brand-electric/90" />
    </div>
  );
}

function ThreeSection({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone?: string;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-white/40">{label}</p>
      <ul className="mt-1 space-y-1">
        {items.map((t, i) => (
          <li key={i} className={cn("text-[12px] leading-snug text-white/70", tone)}>
            · {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ImpactTable({ impact }: { impact: ImpactMap }) {
  const keys = Object.keys(impact).filter((k) => IMPACT_LABELS[k]);
  if (keys.length === 0) return <EmptyHint text="该决策对关键指标无显著影响" />;
  return (
    <div className="space-y-2">
      {keys.map((k) => {
        const v = impact[k];
        const improved = v.delta >= 0;
        const fmt = (n: number) =>
          k === "goalProbability" ? formatPercent(n * 100) : k === "healthScore" || k === "emergencyMonths" ? String(Math.round(n)) : formatCurrency(n);
        return (
          <div key={k} className="flex items-center justify-between text-xs">
            <span className="text-white/50">{IMPACT_LABELS[k]}</span>
            <span className="flex items-center gap-2">
              <span className="text-white/40">{fmt(v.before)}</span>
              <ArrowRight className="h-3 w-3 text-white/30" />
              <span className={cn("font-medium", improved ? "text-semantic-success" : "text-rose-400")}>
                {fmt(v.after)}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function EventSimulator({ events }: { events: CatalogEvent[] }) {
  const [type, setType] = useState("buy_house");
  const [params, setParams] = useState<Record<string, string>>({});
  const simulate = useSimulate();
  const selected = events.find((e) => e.type === type);

  const run = async () => {
    const parsed: Record<string, number> = {};
    selected?.params.forEach((p) => {
      const raw = params[p.key];
      if (raw !== undefined && raw.trim() !== "") {
        parsed[p.key] = p.type === "ratio" ? Number(raw) / 100 : Number(raw);
      }
    });
    simulate.mutate({ eventType: type, params: parsed, horizon: 10, useAi: true, persist: true });
  };

  const result = simulate.data as SimulateResult | undefined;

  return (
    <Section
      title="人生事件模拟沙盘"
      icon={<FlaskConical className="h-4 w-4" />}
      hint="只读推演，不修改真实财富档案"
    >
      <div className="space-y-4">
        <p className="text-xs text-white/45">
          选择一个人生事件，AI CFO 会在沙盘中推演它对你财务健康、退休目标与现金流的影响，并给出「原因 / 影响 / 建议」三段式解释。
        </p>
        <div className="flex flex-wrap gap-2">
          {events.map((e) => (
            <button
              key={e.type}
              type="button"
              onClick={() => {
                setType(e.type);
                setParams({});
                simulate.reset();
              }}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs transition",
                type === e.type
                  ? "border-brand-electric/40 bg-brand-electric/10 text-brand-electric"
                  : "border-white/10 bg-white/[0.03] text-white/50 hover:text-white/80"
              )}
            >
              {e.label}
            </button>
          ))}
        </div>

        {selected?.params.length ? (
          <div className="grid grid-cols-2 gap-3">
            {selected.params.map((p) => (
              <div key={p.key}>
                <label className="text-[11px] text-white/45">
                  {p.label}
                  {p.type === "ratio" ? "（%）" : ""}
                </label>
                <input
                  defaultValue={p.type === "ratio" ? String(p.default * 100) : String(p.default)}
                  key={`${type}-${p.key}`}
                  onChange={(e) =>
                    setParams((prev) => ({ ...prev, [p.key]: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white outline-none focus:border-brand-electric/40"
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-white/35">该事件无需参数，使用默认假设直接推演。</p>
        )}

        <button
          type="button"
          onClick={run}
          disabled={simulate.isPending || events.length === 0}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-brand px-4 py-2 text-xs font-medium text-white shadow-glow-blue transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FlaskConical className={simulate.isPending ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          {simulate.isPending ? "推演中…" : `模拟「${selected?.label ?? ""}」影响`}
        </button>

        {result?.hasData && (
          <div className="space-y-3">
            <ImpactTable impact={result.impact} />
            <ExplanationBlock exp={result.explanation} title={result.eventLabel} />
          </div>
        )}
      </div>
    </Section>
  );
}

function PlanCompare({ events }: { events: CatalogEvent[] }) {
  const [plans, setPlans] = useState<
    { key: string; label: string; selected: string[] }[]
  >([
    { key: "A", label: "方案 A", selected: [] },
    { key: "B", label: "方案 B", selected: [] },
    { key: "C", label: "方案 C", selected: [] },
  ]);
  const compare = useComparePlans();
  const result = compare.data as CompareResult | undefined;

  const toggle = (idx: number, type: string) => {
    setPlans((prev) =>
      prev.map((p, i) =>
        i === idx
          ? {
              ...p,
              selected: p.selected.includes(type)
                ? p.selected.filter((t) => t !== type)
                : [...p.selected, type],
            }
          : p
      )
    );
  };

  const run = () => {
    const body = {
      plans: plans.map((p) => ({
        key: p.key,
        label: p.label,
        events: p.selected.map((t) => ({ type: t, params: {} })),
      })),
      horizon: 10,
    };
    compare.mutate(body);
  };

  return (
    <Section
      title="方案 A / B / C 对比"
      icon={<GitCompareArrows className="h-4 w-4" />}
      hint="同一起点叠加不同事件，综合排序推荐"
    >
      <div className="space-y-4">
        <p className="text-xs text-white/45">
          为每个方案勾选若干人生事件（使用默认假设），运行后系统将按「10 年净资产 + 健康分 + 目标概率」综合排序并给出推荐方案。
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {plans.map((p, idx) => (
            <div key={p.key} className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
              <input
                value={p.label}
                onChange={(e) =>
                  setPlans((prev) =>
                    prev.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x))
                  )
                }
                className="mb-2 w-full rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-xs font-medium text-white outline-none focus:border-brand-electric/40"
              />
              <div className="flex flex-wrap gap-1.5">
                {events.map((e) => (
                  <button
                    key={e.type}
                    type="button"
                    onClick={() => toggle(idx, e.type)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-[10px] transition",
                      p.selected.includes(e.type)
                        ? "border-brand-electric/40 bg-brand-electric/10 text-brand-electric"
                        : "border-white/10 bg-white/[0.02] text-white/45 hover:text-white/70"
                    )}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={run}
          disabled={compare.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-brand px-4 py-2 text-xs font-medium text-white shadow-glow-blue transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <GitCompareArrows className={compare.isPending ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          {compare.isPending ? "对比中…" : "运行方案对比"}
        </button>

        {result?.hasData && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-emerald-400/5 p-3 ring-1 ring-emerald-400/20">
              <StatusBadge tone="success">推荐方案</StatusBadge>
              <span className="text-sm font-medium text-white">{result.recommended.label}</span>
              <span className="text-[11px] text-white/55">{result.recommended.reason}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {result.plans.map((pl) => {
                const isBest = pl.key === result.recommended.key;
                return (
                  <div
                    key={pl.key}
                    className={
                      isBest
                        ? "rounded-xl bg-emerald-400/[0.06] p-3 ring-1 ring-emerald-400/40"
                        : "rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10"
                    }
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-white">{pl.label}</p>
                      {isBest && <StatusBadge tone="success">推荐</StatusBadge>}
                    </div>
                    <div className="mt-2">
                      <ImpactTable impact={pl.impact} />
                    </div>
                  </div>
                );
              })}
            </div>
            {(() => {
              // 解读必须对应「推荐方案」，而非固定取第一个方案
              const best =
                result.plans.find((pl) => pl.key === result.recommended.key) ?? result.plans[0];
              if (!best) return null;
              return (
                <ExplanationBlock
                  exp={best.explanation}
                  title={`最优方案解读 · ${best.label}`}
                />
              );
            })()}
          </div>
        )}
      </div>
    </Section>
  );
}

function WorkflowButton({ onRun, pending }: { onRun: () => void; pending: boolean }) {
  return (
    <button
      type="button"
      onClick={onRun}
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-full border border-brand-electric/30 bg-brand-electric/10 px-4 py-2 text-xs font-medium text-brand-electric transition hover:bg-brand-electric/20 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Brain className={pending ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
      {pending ? "分析中…" : "运行 AI 财富顾问工作流"}
    </button>
  );
}

function WorkflowPanel({
  result,
  pending,
}: {
  result: WorkflowResult | null;
  pending: boolean;
}) {
  if (pending) {
    return (
      <Section title="AI 财富顾问工作流" icon={<Brain className="h-4 w-4" />} hint="多 Agent 协作分析中">
        <div className="flex items-center gap-2 py-6 text-xs text-white/50">
          <Brain className="h-4 w-4 animate-spin text-brand-electric" />
          正在调度诊断 / 预测 / 风险 / 策略 / 汇总 Agent…
        </div>
      </Section>
    );
  }

  if (!result?.hasData) return null;

  return (
    <Section
      title="AI 财富顾问工作流"
      icon={<Brain className="h-4 w-4" />}
      hint={`${(result.findings ?? []).length} 个 Agent 协作 · 耗时 ${result.elapsedMs}ms${result.memoryUsed ? " · 已结合历史记忆" : ""}`}
    >
      {/* 执行轨迹 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(result.trace ?? []).map((t) => (
          <span
            key={t.step}
            className="inline-flex items-center gap-1 rounded-md bg-white/[0.04] px-2 py-1 text-[10px] text-white/55 ring-1 ring-white/10"
          >
            <span className="text-brand-electric">{t.step}</span>
            {t.label}
          </span>
        ))}
      </div>

      {/* 五 Agent 三段式 */}
      <div className="space-y-2.5">
        {(result.findings ?? []).map((f) => (
          <div key={f.agent} className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-white">{f.label}</span>
              {f.score != null && <StatusBadge tone="info">分 {f.score}</StatusBadge>}
              {tierBadge(f.explanation.tier)}
            </div>
            <ThreeSection label="原因" items={f.explanation.cause} />
            <ThreeSection label="影响" items={f.explanation.impact} />
            <ThreeSection label="建议" items={f.explanation.advice} tone="text-brand-electric/90" />
          </div>
        ))}
      </div>

      {/* 策略：后端结构为 strategies.horizons[]，每个 horizon 含 actions[]{title,detail,priority} */}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {(result.strategies?.horizons ?? []).map((col) => (
          <div key={col.key} className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
            <p className="mb-2 text-[11px] font-medium tracking-wide text-white/40">{col.label}</p>
            <ul className="space-y-2">
              {(col.actions ?? []).map((it, i) => (
                <li key={i} className="text-[11px] leading-snug">
                  <div className="flex items-start gap-1.5">
                    <span className="mt-[3px] text-brand-electric">·</span>
                    <div className="min-w-0">
                      <p className="font-medium text-white/85">{it.title}</p>
                      <p className="mt-0.5 text-white/55">{it.detail}</p>
                    </div>
                  </div>
                </li>
              ))}
              {(col.actions ?? []).length === 0 && (
                <li className="text-[11px] text-white/35">该阶段暂无需调整</li>
              )}
            </ul>
          </div>
        ))}
      </div>

      {/* 总结 */}
      <div className="mt-4">
        <ExplanationBlock exp={result.summary} title="财富智能总结" />
      </div>
    </Section>
  );
}
