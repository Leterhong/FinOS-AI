"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Bell, ChevronDown, Menu, Plus, Search, ShieldCheck } from "lucide-react";
import { useEnterpriseStore } from "@/store/enterprise-store";

const titles: Record<string, string> = { "/": "企业经营决策台", "/cases": "项目中心", "/documents": "资料研判", "/risk": "风险中心", "/research": "投研中心", "/rules": "规则库", "/agents": "Agent 中心", "/workflows": "流程中心", "/assistant": "智能研判助手" };
const modules = Object.entries(titles).map(([href,label]) => ({ href,label }));

export default function DashboardHeader({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const pathname = usePathname();
  const cases = useEnterpriseStore((state) => state.cases); const risks = useEnterpriseStore((state) => state.risks); const resetWorkspace = useEnterpriseStore((state) => state.resetWorkspace);
  const [query,setQuery] = useState(""); const [bellOpen,setBellOpen] = useState(false); const [workspaceOpen,setWorkspaceOpen] = useState(false);
  const matches = query.trim() ? [...modules.filter(item => item.label.includes(query.trim())), ...cases.filter(item => `${item.company}${item.title}`.includes(query.trim())).slice(0,4).map(item => ({href:"/cases",label:`${item.company} · ${item.title}`}))] : [];
  const pending = risks.filter(risk => risk.status === "待核验");
  return <header className="relative z-30 mb-5 flex h-[58px] shrink-0 items-center gap-3 border-b border-white/[0.07] pb-3">
    <button type="button" onClick={onMenuToggle} aria-label="打开导航" className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-slate-300 lg:hidden"><Menu className="h-5 w-5" /></button>
    <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-100">{titles[pathname] ?? "FinOS 企业金融 Agent"}</p><p className="mt-0.5 hidden text-[10px] text-slate-500 sm:block">资料有据 · 规则可查 · 风险可追 · 结论可复核</p></div>
    <div className="relative ml-auto hidden min-w-0 max-w-md flex-1 md:block"><label className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3"><Search className="h-3.5 w-3.5 text-slate-600" /><input value={query} onChange={event => setQuery(event.target.value)} aria-label="全局搜索" placeholder="搜索企业、项目、资料或风险信号" className="min-w-0 flex-1 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600" /><kbd className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] text-slate-600">⌘ K</kbd></label>{query && <div className="absolute inset-x-0 top-11 overflow-hidden rounded-xl border border-white/10 bg-[#0a121e] shadow-2xl">{matches.length ? matches.map((item,index) => <Link key={`${item.href}-${index}`} href={item.href} onClick={() => setQuery("")} className="block border-b border-white/[0.06] px-4 py-3 text-xs text-slate-300 last:border-0 hover:bg-white/[0.04]">{item.label}</Link>) : <p className="px-4 py-5 text-center text-xs text-slate-600">没有找到匹配内容</p>}</div>}</div>
    <div className="hidden items-center gap-1.5 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.06] px-2.5 py-1.5 text-[10px] text-emerald-300 xl:flex"><ShieldCheck className="h-3.5 w-3.5" />证据链服务正常</div>
    <div className="relative"><button type="button" onClick={() => setBellOpen(value => !value)} aria-label="通知" className="relative grid h-9 w-9 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-slate-400 hover:text-white"><Bell className="h-4 w-4" />{pending.length > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-400 px-1 text-[9px] text-white">{pending.length}</span>}</button>{bellOpen && <div className="absolute right-0 top-11 w-72 overflow-hidden rounded-xl border border-white/10 bg-[#0a121e] shadow-2xl"><div className="border-b border-white/[0.07] px-4 py-3 text-xs font-medium text-white">待核验风险</div>{pending.slice(0,3).map(risk => <Link key={risk.id} href="/risk" onClick={() => setBellOpen(false)} className="block border-b border-white/[0.06] px-4 py-3 last:border-0 hover:bg-white/[0.04]"><p className="text-xs text-slate-300">{risk.title}</p><p className="mt-1 text-[10px] text-slate-600">{risk.company}</p></Link>)}{pending.length === 0 && <p className="px-4 py-5 text-center text-xs text-slate-600">没有待核验风险</p>}</div>}</div>
    <Link href="/cases" className="hidden h-9 items-center gap-2 rounded-xl bg-cyan-300 px-3.5 text-xs font-semibold text-[#041018] shadow-[0_8px_25px_rgba(103,232,249,.15)] transition hover:bg-cyan-200 sm:flex"><Plus className="h-3.5 w-3.5" />新建研判</Link>
    <div className="relative hidden xl:block"><button type="button" onClick={() => setWorkspaceOpen(value => !value)} className="flex items-center gap-2 text-xs text-slate-400"><span className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.05] text-[10px] text-slate-200">WL</span><ChevronDown className="h-3 w-3" /></button>{workspaceOpen && <div className="absolute right-0 top-11 w-52 rounded-xl border border-white/10 bg-[#0a121e] p-2 shadow-2xl"><p className="px-2 py-2 text-[10px] text-slate-600">华东产业金融中心</p><button onClick={() => { resetWorkspace(); setWorkspaceOpen(false); }} className="w-full rounded-lg px-2 py-2 text-left text-xs text-slate-300 hover:bg-white/[0.05]">重置演示工作区</button></div>}</div>
  </header>;
}
