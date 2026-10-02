"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, ArrowLeft, Building2, Expand, FileText, Gauge, ListChecks, Maximize2, RefreshCw, ShieldAlert, TrendingUp } from "lucide-react";
import { useEnterpriseStore } from "@/store/enterprise-store";
import { useModelStore } from "@/store/model-store";
import { backendAuthedFetch } from "@/lib/enterprise-sync";
import { scoreProject } from "@/lib/risk-score";
import type { RiskLevel } from "@/types/enterprise";

const LEVEL_META: Record<RiskLevel, { label: string; color: string }> = {
  critical: { label: "重大", color: "#ff4d6d" },
  high: { label: "高", color: "#ff8a4c" },
  medium: { label: "中", color: "#f6c344" },
  low: { label: "低", color: "#4c8dff" },
};
const LEVEL_ORDER: RiskLevel[] = ["critical", "high", "medium", "low"];
const STAGES = ["待处理", "处理中", "待复核", "已完成"] as const;

function Donut({ segments, center, caption }: { segments: Array<{ label: string; value: number; color: string }>; center: string; caption: string }) {
  const total = segments.reduce((sum, item) => sum + item.value, 0);
  let offset = 0;
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 42 42" className="h-40 w-40 shrink-0 -rotate-90">
        <circle cx="21" cy="21" r="15.9155" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4" />
        {total > 0 && segments.map((item) => {
          const pct = (item.value / total) * 100;
          const dash = `${pct} ${100 - pct}`;
          const el = <circle key={item.label} cx="21" cy="21" r="15.9155" fill="none" stroke={item.color} strokeWidth="4" strokeDasharray={dash} strokeDashoffset={-offset} strokeLinecap="butt" />;
          offset += pct;
          return el;
        })}
      </svg>
      <div className="min-w-0 flex-1">
        <p className="numeric text-3xl font-semibold text-white">{center}</p>
        <p className="mt-1 text-[10px] text-slate-500">{caption}</p>
        <div className="mt-3 space-y-1.5">
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
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="flex items-center justify-between text-[11px]">
            <span className="truncate text-slate-300">{item.label}</span>
            <span className="numeric shrink-0 text-slate-400">{item.value}{item.sub ? <span className="ml-1 text-slate-600">{item.sub}</span> : null}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.05]">
            <div className="h-full rounded-full transition-all" style={{ width: `${max > 0 ? Math.max(2, (item.value / max) * 100) : 0}%`, backgroundColor: item.color ?? "#22d3ee" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, unit, accent = "#22d3ee" }: { icon: typeof Activity; label: string; value: string; unit?: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[.14em] text-slate-500">
        <Icon className="h-3.5 w-3.5" style={{ color: accent }} />
        {label}
      </div>
      <p className="numeric mt-2 text-2xl font-semibold text-white">{value}<span className="ml-1 text-xs text-slate-500">{unit}</span></p>
    </div>
  );
}

export default function ScreenPage() {
  const cases = useEnterpriseStore((state) => state.cases);
  const documents = useEnterpriseStore((state) => state.documents);
  const risks = useEnterpriseStore((state) => state.risks);
  const rules = useEnterpriseStore((state) => state.rules);
  const tasks = useEnterpriseStore((state) => state.tasks);
  const briefs = useEnterpriseStore((state) => state.briefs);
  const active = useModelStore((state) => state.active);
  const [clock, setClock] = useState("--:--:--");
  const [external, setExternal] = useState<{ fx?: string; lpr?: string } | null>(null);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, []);

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
        lpr: lprRow ? Object.entries(lprRow).filter(([, v]) => v != null).slice(0, 2).map(([k, v]) => `${k} ${v}`).join(" · ") : undefined,
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
      .slice(0, 8);
    const stageCounts = STAGES.map((stage) => tasks.filter((item) => item.stage === stage).length);
    const doneTasks = tasks.filter((item) => item.stage === "已完成").length;
    const ruleTested = rules.filter((rule) => rule.coverage === "已测试").length;
    const ruleHits = documents.reduce((sum, doc) => sum + (doc.ruleOutcomes ?? []).filter((outcome) => outcome.hit).length, 0);
    const avgProgress = activeCases.length ? Math.round(activeCases.reduce((sum, item) => sum + item.progress, 0) / activeCases.length) : 0;
    const overall = scoreProject(risks);
    const recentRisks = [...risks].sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""))).slice(0, 7);
    return { activeCases, facts: facts.length, confirmedFacts, riskByLevel, pendingRisks, projectScores, stageCounts, doneTasks, ruleTested, ruleHits, avgProgress, overall, recentRisks };
  }, [cases, documents, risks, rules, tasks]);

  const donutSegments = stats.riskByLevel.map((item) => ({ label: `${LEVEL_META[item.level].label}风险`, value: item.count, color: LEVEL_META[item.level].color }));
  const stageMax = Math.max(1, ...stats.stageCounts);
  const scoreMax = Math.max(1, ...stats.projectScores.map((item) => item.score));

  const goFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.();
  };

  return (
    <div className="page-shell">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-300"><ArrowLeft className="h-3.5 w-3.5" />返回决策台</Link>
        <div className="flex items-baseline gap-3">
          <h1 className="text-lg font-semibold tracking-wide text-white">企业经营风险数据大屏</h1>
          <span className="text-[10px] text-slate-600">数据来自当前工作区，实时汇总</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="numeric rounded-lg border border-white/[0.08] px-3 py-1.5 text-xs text-cyan-200">{clock}</span>
          <button type="button" onClick={() => void loadExternal()} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:border-cyan-400/25 hover:text-cyan-200"><RefreshCw className="h-3.5 w-3.5" />刷新</button>
          <button type="button" onClick={goFullscreen} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-300 px-3 py-1.5 text-xs font-semibold text-[#041018]"><Maximize2 className="h-3.5 w-3.5" />全屏</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-8">
        <Kpi icon={Building2} label="企业项目" value={String(stats.activeCases.length)} />
        <Kpi icon={FileText} label="资料总数" value={String(documents.length)} />
        <Kpi icon={ListChecks} label="结构化事实" value={String(stats.facts)} accent="#34d399" />
        <Kpi icon={ShieldAlert} label="待核验风险" value={String(stats.pendingRisks)} accent="#f6c344" />
        <Kpi icon={AlertTriangle} label="重大风险" value={String(stats.riskByLevel[0].count)} accent="#ff4d6d" />
        <Kpi icon={Activity} label="规则命中" value={String(stats.ruleHits)} accent="#2dd4bf" />
        <Kpi icon={TrendingUp} label="平均进度" value={`${stats.avgProgress}`} unit="%" accent="#22d3ee" />
        <Kpi icon={Gauge} label="项目风险评分" value={String(stats.overall.score)} unit="/100" accent="#fb7185" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 xl:col-span-1">
          <p className="text-xs font-semibold text-slate-200">风险等级分布</p>
          <p className="mt-1 text-[10px] text-slate-600">按等级统计全部风险线索</p>
          <div className="mt-4">
            <Donut segments={donutSegments} center={String(risks.length)} caption="风险线索总数" />
          </div>
        </section>

        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 xl:col-span-2">
          <div className="flex items-center justify-between"><p className="text-xs font-semibold text-slate-200">项目风险评分排行</p><span className="text-[10px] text-slate-600">0–100，越高风险越大</span></div>
          <div className="mt-4">
            <BarList
              items={stats.projectScores.map((item) => ({
                label: item.label,
                value: item.score,
                sub: `进度 ${item.progress}%`,
                color: item.score >= 80 ? "#ff4d6d" : item.score >= 60 ? "#ff8a4c" : item.score >= 35 ? "#f6c344" : "#4c8dff",
              }))}
              max={scoreMax}
              empty="尚无风险数据"
            />
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <p className="text-xs font-semibold text-slate-200">流程任务阶段</p>
          <p className="mt-1 text-[10px] text-slate-600">已完成 {stats.doneTasks} / {tasks.length}</p>
          <div className="mt-4">
            <BarList
              items={STAGES.map((stage, index) => ({ label: stage, value: stats.stageCounts[index], color: ["#64748b", "#22d3ee", "#f6c344", "#34d399"][index] }))}
              max={stageMax}
              empty="尚无任务"
            />
          </div>
        </section>

        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <p className="text-xs font-semibold text-slate-200">规则库覆盖</p>
          <p className="mt-1 text-[10px] text-slate-600">共 {rules.length} 条 · 已测试 {stats.ruleTested}</p>
          <div className="mt-5 space-y-4">
            <div>
              <div className="flex justify-between text-[11px]"><span className="text-slate-400">已测试覆盖率</span><span className="numeric text-slate-200">{rules.length ? Math.round((stats.ruleTested / rules.length) * 100) : 0}%</span></div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${rules.length ? (stats.ruleTested / rules.length) * 100 : 0}%` }} /></div>
            </div>
            <div>
              <div className="flex justify-between text-[11px]"><span className="text-slate-400">事实已确认</span><span className="numeric text-slate-200">{stats.facts ? Math.round((stats.confirmedFacts / stats.facts) * 100) : 0}%</span></div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full rounded-full bg-cyan-300" style={{ width: `${stats.facts ? (stats.confirmedFacts / stats.facts) * 100 : 0}%` }} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><p className="text-[10px] text-slate-500">研究底稿</p><p className="numeric mt-1 text-xl text-white">{briefs.length}</p></div>
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><p className="text-[10px] text-slate-500">模型状态</p><p className="mt-1 text-xs text-white">{active?.configured ? "已连接" : "未配置"}</p></div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <p className="text-xs font-semibold text-slate-200">外部市场数据</p>
          <p className="mt-1 text-[10px] text-slate-600">公开数据，需人工复核</p>
          <div className="mt-4 grid grid-cols-1 gap-3">
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
              <p className="text-[10px] text-slate-500">USD / CNY 汇率</p>
              <p className="numeric mt-1 text-2xl text-white">{external?.fx ?? "—"}</p>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
              <p className="text-[10px] text-slate-500">最新 LPR</p>
              <p className="mt-1 text-xs text-slate-200">{external?.lpr ?? "—"}</p>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-200">最近更新风险</p>
          <Link href="/risk" className="inline-flex items-center gap-1 text-[11px] text-cyan-300"><Expand className="h-3 w-3" />风险中心</Link>
        </div>
        {stats.recentRisks.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-600">尚无风险数据</p>
        ) : (
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {stats.recentRisks.map((risk) => (
              <div key={risk.id} className="flex items-start gap-3 rounded-xl border border-white/[0.07] p-3">
                <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: LEVEL_META[risk.level].color }} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-slate-200">{risk.title}</p>
                  <p className="mt-1 truncate text-[10px] text-slate-600">{risk.company} · {LEVEL_META[risk.level].label} · {risk.status}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
