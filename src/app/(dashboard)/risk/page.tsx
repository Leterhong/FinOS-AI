"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, ShieldAlert } from "lucide-react";
import { PageIntro, Panel, RiskBadge, riskMeta } from "@/components/enterprise/EnterpriseUI";
import { useEnterpriseStore } from "@/store/enterprise-store";

export default function RiskPage() {
  const risks = useEnterpriseStore((state) => state.risks);
  const verifyRisk = useEnterpriseStore((state) => state.verifyRisk);
  const [level, setLevel] = useState("all");
  const filtered = risks.filter(risk => level === "all" || (level === "pending" ? risk.status === "待核验" : risk.level === level));
  const filters = [
    ["全部信号", risks.length, "all"],
    ["重大风险", risks.filter(risk => risk.level === "critical").length, "critical"],
    ["高风险", risks.filter(risk => risk.level === "high").length, "high"],
    ["待人工核验", risks.filter(risk => risk.status === "待核验").length, "pending"],
  ] as const;

  return <div className="page-shell"><PageIntro eyebrow="Risk intelligence" title="企业风险中心" description="风险提示必须同时呈现事实证据、命中规则、潜在影响与核验状态，避免黑箱评分和无依据结论。" />
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{filters.map(([label,count,value]) => <button key={value} onClick={() => setLevel(value)} className={`rounded-2xl border p-4 text-left transition ${level === value ? "border-cyan-300/25 bg-cyan-300/[0.07]" : "border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.04]"}`}><p className="text-xs text-slate-500">{label}</p><p className="numeric mt-2 text-2xl font-semibold text-white">{count}</p></button>)}</div>
    <Panel><div className="divide-y divide-white/[0.07]">{filtered.map(signal => <article key={signal.id} className="grid gap-4 p-5 lg:grid-cols-[1.1fr_1fr_.72fr]"><div><div className="flex items-center gap-2"><RiskBadge level={signal.level} /><span className="text-[10px] text-slate-600">{signal.id}</span></div><h2 className="mt-3 text-sm font-semibold text-slate-100">{signal.title}</h2><p className="mt-1.5 text-xs text-slate-500">{signal.company} · {signal.caseId}</p><div className="mt-3 flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${riskMeta[signal.level].dot}`} /><span className="text-[11px] text-slate-400">{signal.status}</span></div></div><div className="rounded-xl border border-white/[0.06] bg-black/10 p-3.5"><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-slate-600">关键证据</p><p className="mt-2 text-xs leading-5 text-slate-300">{signal.evidence}</p><p className="mt-3 text-[10px] text-cyan-300/70">命中：{signal.rule}</p></div><div className="flex flex-col"><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-slate-600">潜在影响</p><p className="mt-2 text-xs leading-5 text-slate-300">{signal.impact}</p><div className="mt-auto flex gap-2 pt-4"><button onClick={() => verifyRisk(signal.id)} disabled={signal.status === "已确认"} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[11px] text-slate-300 disabled:border-emerald-400/15 disabled:text-emerald-300"><CheckCircle2 className="h-3 w-3" />{signal.status === "已确认" ? "已完成核验" : "标记核验"}</button><button onClick={() => setLevel("all")} aria-label="查看全部风险" className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-300 text-[#041018]"><ArrowRight className="h-3.5 w-3.5" /></button></div></div></article>)}{filtered.length === 0 && <div className="p-12 text-center text-xs text-slate-500">当前筛选条件下没有风险信号</div>}</div></Panel>
    <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.04] p-4 text-xs leading-5 text-amber-100/70"><ShieldAlert className="mr-2 inline h-4 w-4" />风险信号用于辅助研判，不直接替代授信、投资或合规决策；所有重大结论需由有权限的业务人员复核。</div>
  </div>;
}
