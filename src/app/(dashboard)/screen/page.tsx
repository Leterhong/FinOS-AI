"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, ArrowLeft, Building2, FileText, Gauge, ListChecks, Maximize2, Pause, Play, RefreshCw, ShieldAlert, TrendingUp } from "lucide-react";
import { useEnterpriseStore } from "@/store/enterprise-store";
import { useModelStore } from "@/store/model-store";
import { backendAuthedFetch } from "@/lib/enterprise-sync";
import { scoreProject, scoreRisk } from "@/lib/risk-score";
import type { RiskLevel } from "@/types/enterprise";

const LEVEL_META: Record<RiskLevel, { label: string; color: string }> = {
  critical: { label: "重大", color: "#ff4d6d" },
  high: { label: "高", color: "#ff8a4c" },
  medium: { label: "中", color: "#f6c344" },
  low: { label: "低", color: "#4c8dff" },
};
const LEVEL_ORDER: RiskLevel[] = ["critical", "high", "medium", "low"];
const STAGES = ["待处理", "处理中", "待复核", "已完成"] as const;
const TABS = ["总览", "风险聚焦", "流程与规则"] as const;
type Tab = typeof TABS[number];

function Donut({ segments, center, caption }: { segments: Array<{ label: string; value: number; color: string }>; center: string; caption: string }) {
  const total = segments.reduce((sum, item) => sum + item.value, 0);
  let offset = 0;
  return (
    <div className="flex h-full items-center gap-4">
      <svg viewBox="0 0 42 42" className="h-32 w-32 shrink-0 -rotate-90">
        <circle cx="21" cy="21" r="15.9155" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4" />
        {total > 0 && segments.map((item) => {
          const pct = (item.value / total) * 100;
          const el = <circle key={item.label} cx="21" cy="21" r="15.9155" fill="none" stroke={item.color} strokeWidth="4" strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={-offset} />;
          offset += pct;
          return el;
        })}
      </svg>
      <div className="min-w-0 flex-1">
        <p className="numeric text-2xl font-semibold text-white">{center}</p>
        <p className="mt-0.5 text-[10px] text-slate-500">{caption}</p>
        <div className="mt-2.5 space-y-1">
          {segments.map((item) => (
            <div key={item.label} className="flex items-center gap-2 text-[11px]">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="flex-1 text-slate-400">{item.label}</span>
              <span className="numeric text-slate-200">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BarList({ items, max, empty }: { items: Array<{ label: string; value: number; sub?: string; color?: string }>; max: number; empty: string }) {
  if (items.length === 0) return <p className="py-8 text-center text-xs text-slate-600">{empty}</p>;
  return (
    <div className="scrollbar-thin max-h-full space-y-2.5 overflow-y-auto pr-1">
      {items.map((item) => (
        <div key={item.label}>
          <div className="flex items-center justify-between text-[11px]">
            <span className="truncate text-slate-300">{item.label}</span>
            <span className="numeric shrink-0 text-slate-400">{item.value}{item.sub ? <span className="ml-1 text-slate-600">{item.sub}</span> : null}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/[0.05]">
            <div className="h-full rounded-full transition-all" style={{ width: `${max > 0 ? Math.max(2, (item.value / max) * 100) : 0}%`, backgroundColor: item.color ?? "#22d3ee" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function LineChart({ points, labels, color = "#22d3ee" }: { points: number[]; labels: string[]; color?: string }) {
  if (points.length === 0) return <p className="py-8 text-center text-xs text-slate-600">尚无期间化事实数据</p>;
  const max = Math.max(1, ...points);
  const w = 100;
  const h = 40;
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const coords = points.map((value, index) => [index * step, h - (value / max) * (h - 6) - 3] as const);
  const line = coords.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `0,${h} ${line} ${w},${h}`;
  return (
    <div className="flex h-full flex-col">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="min-h-0 w-full flex-1">
        <polygon points={area} fill={color} opacity="0.12" />
        <polyline points={line} fill="none" stroke={color} strokeWidth="0.7" vectorEffect="non-scaling-stroke" />
        {coords.map(([x, y], index) => <circle key={index} cx={x} cy={y} r="1" fill={color} />)}
      </svg>
      <div className="mt-1.5 flex justify-between text-[9px] text-slate-600">
        {(labels.length <= 5 ? labels : [0, Math.floor((labels.length - 1) / 4), Math.floor((labels.length - 1) / 2), Math.floor(((labels.length - 1) * 3) / 4), labels.length - 1].map((index) => labels[index])).map((label, index) => <span key={`${label}-${index}`} className="min-w-0 flex-1 truncate text-center">{label}</span>)}
      </div>
    </div>
  );
}

function Heatmap({ rows, cols, empty }: { rows: Array<{ label: string; counts: number[] }>; cols: string[]; empty: string }) {
  if (rows.length === 0) return <p className="py-8 text-center text-xs text-slate-600">{empty}</p>;
  const max = Math.max(1, ...rows.flatMap((row) => row.counts));
  return (
    <div className="scrollbar-thin h-full overflow-y-auto pr-1">
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `minmax(72px, 1.4fr) repeat(${cols.length}, 1fr)` }}>
        <span />
        {cols.map((col) => <span key={col} className="text-center text-[9px] text-slate-500">{col}</span>)}
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <span className="truncate text-[10px] text-slate-400">{row.label}</span>
            {row.counts.map((count, index) => {
              const intensity = count / max;
              const color = LEVEL_META[LEVEL_ORDER[index]].color;
              return (
                <div key={index} className="grid h-7 place-items-center rounded-md border border-white/[0.05] text-[10px]" style={{ backgroundColor: count ? `${color}${Math.round(20 + intensity * 60).toString(16).padStart(2, "0")}` : "rgba(255,255,255,0.02)", color: count ? "#fff" : "#475569" }}>
                  {count || "—"}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function Section({ title, hint, children, className }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 ${className ?? ""}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-200">{title}</p>
        {hint && <span className="text-[10px] text-slate-600">{hint}</span>}
      </div>
      <div className="mt-3 min-h-0 flex-1">{children}</div>
    </section>
  );
}

function Kpi({ icon: Icon, label, value, unit, accent = "#22d3ee" }: { icon: typeof Activity; label: string; value: string; unit?: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[.12em] text-slate-500">
        <Icon className="h-3.5 w-3.5" style={{ color: accent }} />
        <span className="truncate">{label}</span>
      </div>
      <p className="numeric mt-1.5 text-xl font-semibold text-white">{value}<span className="ml-1 text-[10px] text-slate-500">{unit}</span></p>
    </div>
  );
}

export default function ScreenPage() {
  const cases = useEnterpriseStore((state) => state.cases);
  const documents = useEnterpriseStore((state) => state.documents);
  const risks = useEnterpriseStore((state) => state.risks);
  const rules = useEnterpriseStore((state) => state.rules);
  const tasks = useEnterpriseStore((state) => state.tasks);
  const active = useModelStore((state) => state.active);
  const [clock, setClock] = useState("--:--:--");
  const [external, setExternal] = useState<{ fx?: string; lpr?: string } | null>(null);
  const [tab, setTab] = useState<Tab>("总览");
  const [monitor, setMonitor] = useState(false);
  const tabRef = useRef(0);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!monitor) return;
    const timer = setInterval(() => {
      tabRef.current = (tabRef.current + 1) % TABS.length;
      setTab(TABS[tabRef.current]);
    }, 12_000);
    return () => clearInterval(timer);
  }, [monitor]);

  const loadExternal = async () => {
    try {
      const [fxResp, lprResp] = await Promise.all([
        backendAuthedFetch("/api/data-sources/fx/latest?base=USD&symbols=CNY"),
        backendAuthedFetch("/api/data-sources/akshare/lpr?limit=1"),
      ]);
      const fx = fxResp.ok ? await fxResp.json() : null;
      const lpr = lprResp.ok ? await lprResp.json() : null;
      const rate = (fx?.data?.rows as Array<Record<string, unknown>> | undefined)?.[0]?.["汇率"];
      const lprRow = (lpr?.data?.rows as Array<Record<string, unknown>> | undefined)?.[0];
      setExternal({
        fx: rate != null ? String(rate) : undefined,
        lpr: lprRow ? Object.entries(lprRow).filter(([, value]) => value != null).slice(0, 2).map(([key, value]) => `${key} ${value}`).join(" · ") : undefined,
      });
    } catch {
      setExternal({});
    }
  };
  useEffect(() => { void loadExternal(); }, []);

  const stats = useMemo(() => {
    const activeCases = cases.filter((item) => !item.archivedAt);
    const facts = documents.flatMap((item) => item.factItems ?? []);
    const confirmedFacts = facts.filter((fact) => fact.reviewStatus === "已确认").length;
    const riskByLevel = LEVEL_ORDER.map((level) => ({ level, count: risks.filter((risk) => risk.level === level).length }));
    const pendingRisks = risks.filter((risk) => risk.status === "待核验").length;
    const projectScores = activeCases
      .map((item) => ({ label: item.company || item.title, score: scoreProject(risks.filter((risk) => risk.caseId === item.id)).score, progress: Math.round(item.progress) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 7);
    const stageCounts = STAGES.map((stage) => tasks.filter((item) => item.stage === stage).length);
    const doneTasks = tasks.filter((item) => item.stage === "已完成").length;
    const ruleTested = rules.filter((rule) => rule.coverage === "已测试").length;
    const ruleHits = documents.reduce((sum, doc) => sum + (doc.ruleOutcomes ?? []).filter((outcome) => outcome.hit).length, 0);
    const avgProgress = activeCases.length ? Math.round(activeCases.reduce((sum, item) => sum + item.progress, 0) / activeCases.length) : 0;
    const overall = scoreProject(risks);
    const recentRisks = [...risks].sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""))).slice(0, 6);
    // 多期趋势：按期间聚合结构化事实数量。
    const periodMap = new Map<string, number>();
    for (const fact of facts) {
      if (!fact.period) continue;
      periodMap.set(String(fact.period), (periodMap.get(String(fact.period)) ?? 0) + 1);
    }
    const trend = [...periodMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-8);
    // 风险热力图：项目 × 等级。
    const heat = activeCases.slice(0, 6).map((item) => ({
      label: item.company || item.title,
      counts: LEVEL_ORDER.map((level) => risks.filter((risk) => risk.caseId === item.id && risk.level === level).length),
    }));
    return { activeCases, facts: facts.length, confirmedFacts, riskByLevel, pendingRisks, projectScores, stageCounts, doneTasks, ruleTested, ruleHits, avgProgress, overall, recentRisks, trend, heat };
  }, [cases, documents, risks, rules, tasks]);

  const donutSegments = stats.riskByLevel.map((item) => ({ label: `${LEVEL_META[item.level].label}风险`, value: item.count, color: LEVEL_META[item.level].color }));
  const stageMax = Math.max(1, ...stats.stageCounts);
  const scoreMax = Math.max(1, ...stats.projectScores.map((item) => item.score));

  const goFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  };

  const levelBars = (label: string, value: number, sub?: string, color?: string) => ({ label, value, sub, color });

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-300"><ArrowLeft className="h-3.5 w-3.5" />返回决策台</Link>
        <h1 className="text-base font-semibold tracking-wide text-white">企业经营风险数据大屏</h1>
        <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] p-0.5">
          {TABS.map((item) => (
            <button key={item} type="button" onClick={() => { tabRef.current = TABS.indexOf(item); setTab(item); }} className={`rounded-md px-2.5 py-1 text-[11px] transition ${tab === item ? "bg-cyan-400/[0.12] text-cyan-200" : "text-slate-500 hover:text-slate-300"}`}>{item}</button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="numeric rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-cyan-200">{clock}</span>
          <button type="button" onClick={() => { setMonitor((value) => !value); }} title="监看模式：定时换页" className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs ${monitor ? "border-cyan-400/30 bg-cyan-400/[0.08] text-cyan-200" : "border-white/10 text-slate-300 hover:border-cyan-400/25"}`}>{monitor ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{monitor ? "监看中" : "监看模式"}</button>
          <button type="button" onClick={() => void loadExternal()} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:border-cyan-400/25 hover:text-cyan-200"><RefreshCw className="h-3.5 w-3.5" />刷新</button>
          <button type="button" onClick={goFullscreen} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-300 px-3 py-1.5 text-xs font-semibold text-[#041018]"><Maximize2 className="h-3.5 w-3.5" />全屏</button>
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
        <Kpi icon={Building2} label="企业项目" value={String(stats.activeCases.length)} />
        <Kpi icon={FileText} label="资料总数" value={String(documents.length)} />
        <Kpi icon={ListChecks} label="结构化事实" value={String(stats.facts)} accent="#34d399" />
        <Kpi icon={ShieldAlert} label="待核验风险" value={String(stats.pendingRisks)} accent="#f6c344" />
        <Kpi icon={AlertTriangle} label="重大风险" value={String(stats.riskByLevel[0].count)} accent="#ff4d6d" />
        <Kpi icon={Activity} label="规则命中" value={String(stats.ruleHits)} accent="#2dd4bf" />
        <Kpi icon={TrendingUp} label="平均进度" value={String(stats.avgProgress)} unit="%" />
        <Kpi icon={Gauge} label="项目风险评分" value={String(stats.overall.score)} unit="/100" accent="#fb7185" />
      </div>

      {tab === "总览" && <>
        <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-12">
          <Section title="风险等级分布" hint="全部风险线索" className="xl:col-span-3"><Donut segments={donutSegments} center={String(risks.length)} caption="风险线索总数" /></Section>
          <Section title="项目风险评分排行" hint="0–100" className="xl:col-span-4"><BarList items={stats.projectScores.map((item) => levelBars(item.label, item.score, `进度 ${item.progress}%`, item.score >= 80 ? "#ff4d6d" : item.score >= 60 ? "#ff8a4c" : item.score >= 35 ? "#f6c344" : "#4c8dff"))} max={scoreMax} empty="尚无风险数据" /></Section>
          <Section title="多期事实趋势" hint="按期间聚合" className="xl:col-span-5"><LineChart points={stats.trend.map(([, count]) => count)} labels={stats.trend.map(([period]) => period)} /></Section>
        </div>
        <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-12">
          <Section title="风险热力图" hint="项目 × 等级" className="xl:col-span-4"><Heatmap rows={stats.heat} cols={LEVEL_ORDER.map((level) => LEVEL_META[level].label)} empty="尚无项目风险数据" /></Section>
          <Section title="流程任务阶段" hint={`已完成 ${stats.doneTasks}/${tasks.length}`} className="xl:col-span-3"><BarList items={STAGES.map((stage, index) => ({ label: stage, value: stats.stageCounts[index], color: ["#64748b", "#22d3ee", "#f6c344", "#34d399"][index] }))} max={stageMax} empty="尚无任务" /></Section>
          <Section title="规则与事实质量" hint="覆盖率" className="xl:col-span-2">
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-[11px]"><span className="text-slate-400">规则已测试</span><span className="numeric text-slate-200">{rules.length ? Math.round((stats.ruleTested / rules.length) * 100) : 0}%</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${rules.length ? (stats.ruleTested / rules.length) * 100 : 0}%` }} /></div>
              </div>
              <div>
                <div className="flex justify-between text-[11px]"><span className="text-slate-400">事实已确认</span><span className="numeric text-slate-200">{stats.facts ? Math.round((stats.confirmedFacts / stats.facts) * 100) : 0}%</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full rounded-full bg-cyan-300" style={{ width: `${stats.facts ? (stats.confirmedFacts / stats.facts) * 100 : 0}%` }} /></div>
              </div>
            </div>
          </Section>
          <Section title="外部市场数据" hint="公开数据" className="xl:col-span-3">
            <div className="grid h-full grid-cols-1 gap-2">
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><p className="text-[10px] text-slate-500">USD / CNY 汇率</p><p className="numeric mt-1 text-xl text-white">{external?.fx ?? "—"}</p></div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><p className="text-[10px] text-slate-500">最新 LPR</p><p className="mt-1 text-[11px] text-slate-200">{external?.lpr ?? "—"}</p><p className="mt-1 text-[9px] text-slate-600">模型：{active?.configured ? "已连接" : "未配置"}</p></div>
            </div>
          </Section>
        </div>
      </>}

      {tab === "风险聚焦" && <>
        <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-12">
          <Section title="风险热力图" hint="项目 × 等级" className="xl:col-span-7"><Heatmap rows={stats.heat} cols={LEVEL_ORDER.map((level) => LEVEL_META[level].label)} empty="尚无项目风险数据" /></Section>
          <Section title="风险等级分布" className="xl:col-span-5"><Donut segments={donutSegments} center={String(risks.length)} caption="风险线索总数" /></Section>
        </div>
        <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-12">
          <Section title="项目风险评分排行" hint="0–100" className="xl:col-span-6"><BarList items={stats.projectScores.map((item) => levelBars(item.label, item.score, `进度 ${item.progress}%`, item.score >= 80 ? "#ff4d6d" : item.score >= 60 ? "#ff8a4c" : item.score >= 35 ? "#f6c344" : "#4c8dff"))} max={scoreMax} empty="尚无风险数据" /></Section>
          <Section title="最近更新风险" className="xl:col-span-6">
            {stats.recentRisks.length === 0 ? <p className="py-8 text-center text-xs text-slate-600">尚无风险数据</p> : (
              <div className="scrollbar-thin max-h-full space-y-2 overflow-y-auto pr-1">
                {stats.recentRisks.map((risk) => (
                  <div key={risk.id} className="flex items-center gap-3 rounded-xl border border-white/[0.07] p-2.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: LEVEL_META[risk.level].color }} />
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-200">{risk.title}</span>
                    <span className="numeric shrink-0 text-[10px] text-slate-500">{scoreRisk(risk)}</span>
                    <span className="shrink-0 text-[10px] text-slate-600">{risk.status}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </>}

      {tab === "流程与规则" && <>
        <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-12">
          <Section title="流程任务阶段" hint={`已完成 ${stats.doneTasks}/${tasks.length}`} className="xl:col-span-5"><BarList items={STAGES.map((stage, index) => ({ label: stage, value: stats.stageCounts[index], color: ["#64748b", "#22d3ee", "#f6c344", "#34d399"][index] }))} max={stageMax} empty="尚无任务" /></Section>
          <Section title="多期事实趋势" hint="按期间聚合" className="xl:col-span-7"><LineChart points={stats.trend.map(([, count]) => count)} labels={stats.trend.map(([period]) => period)} /></Section>
        </div>
        <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-12">
          <Section title="规则与事实质量" className="xl:col-span-4">
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-[11px]"><span className="text-slate-400">规则已测试</span><span className="numeric text-slate-200">{rules.length ? Math.round((stats.ruleTested / rules.length) * 100) : 0}%</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${rules.length ? (stats.ruleTested / rules.length) * 100 : 0}%` }} /></div>
              </div>
              <div>
                <div className="flex justify-between text-[11px]"><span className="text-slate-400">事实已确认</span><span className="numeric text-slate-200">{stats.facts ? Math.round((stats.confirmedFacts / stats.facts) * 100) : 0}%</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full rounded-full bg-cyan-300" style={{ width: `${stats.facts ? (stats.confirmedFacts / stats.facts) * 100 : 0}%` }} /></div>
              </div>
              <p className="text-[10px] text-slate-600">规则命中 {stats.ruleHits} 次 · 规则共 {rules.length} 条</p>
            </div>
          </Section>
          <Section title="外部市场数据" hint="公开数据" className="xl:col-span-3">
            <div className="grid h-full grid-cols-1 gap-2">
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><p className="text-[10px] text-slate-500">USD / CNY 汇率</p><p className="numeric mt-1 text-xl text-white">{external?.fx ?? "—"}</p></div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><p className="text-[10px] text-slate-500">最新 LPR</p><p className="mt-1 text-[11px] text-slate-200">{external?.lpr ?? "—"}</p></div>
            </div>
          </Section>
          <Section title="最近更新风险" className="xl:col-span-5">
            {stats.recentRisks.length === 0 ? <p className="py-8 text-center text-xs text-slate-600">尚无风险数据</p> : (
              <div className="scrollbar-thin max-h-full space-y-2 overflow-y-auto pr-1">
                {stats.recentRisks.slice(0, 5).map((risk) => (
                  <div key={risk.id} className="flex items-center gap-3 rounded-xl border border-white/[0.07] p-2.5">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: LEVEL_META[risk.level].color }} />
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-200">{risk.title}</span>
                    <span className="shrink-0 text-[10px] text-slate-600">{risk.status}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </>}
    </div>
  );
}
