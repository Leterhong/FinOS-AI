"use client";

import { type FormEvent, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Filter, Plus, Search } from "lucide-react";
import { EmptyStateCard, PageIntro, Panel, RiskBadge } from "@/components/enterprise/EnterpriseUI";
import EnterpriseDialog from "@/components/enterprise/EnterpriseDialog";
import { useEnterpriseStore } from "@/store/enterprise-store";
import type { EnterpriseCase } from "@/types/enterprise";

export default function CasesPage() {
  const items = useEnterpriseStore((state) => state.cases);
  const createCase = useEnterpriseStore((state) => state.createCase);
  const [query, setQuery] = useState("");
  const [risk, setRisk] = useState("全部");
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<EnterpriseCase | null>(null);
  const cases = useMemo(
    () => items.filter((item) => (risk === "全部" || item.risk === risk)
      && `${item.company}${item.title}${item.industry}`.toLowerCase().includes(query.toLowerCase())),
    [items, query, risk],
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const item = createCase({ company: String(data.get("company")), title: String(data.get("title")), industry: String(data.get("industry")), amount: String(data.get("amount")), owner: String(data.get("owner")) });
    setCreateOpen(false);
    setSelected(item);
  };

  return <div className="page-shell">
    <PageIntro eyebrow="Case management" title="企业项目中心" description="围绕一个融资、尽调或经营分析任务集中管理资料、规则、风险、结论和流程。" actions={<button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]"><Plus className="h-3.5 w-3.5" />新建项目</button>} />
    <div className="flex flex-col gap-3 sm:flex-row">
      <label className="flex flex-1 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3.5"><Search className="h-4 w-4 text-slate-600" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索企业、项目或行业" className="h-11 min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-slate-600" /></label>
      <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-white/[0.08] bg-white/[0.025] p-1"><Filter className="ml-2 h-3.5 w-3.5 shrink-0 text-slate-600" />{[["全部", "全部"], ["重大", "critical"], ["高风险", "high"], ["中风险", "medium"], ["低风险", "low"]].map(([label, value]) => <button key={value} onClick={() => setRisk(value)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-[11px] ${risk === value ? "bg-white/[0.09] text-white" : "text-slate-500 hover:text-slate-300"}`}>{label}</button>)}</div>
    </div>
    <Panel>
      <div className="hidden grid-cols-[1.5fr_.7fr_.65fr_.55fr] border-b border-white/[0.07] px-5 py-3 text-[10px] font-semibold uppercase tracking-[.14em] text-slate-600 sm:grid"><span>企业 / 项目</span><span>融资金额</span><span>进度</span><span>负责人</span></div>
      <div className="divide-y divide-white/[0.06]">
        {cases.map((item) => <button key={item.id} onClick={() => setSelected(item)} className="group grid w-full grid-cols-1 gap-4 px-5 py-5 text-left transition hover:bg-white/[0.025] sm:grid-cols-[1.5fr_.7fr_.65fr_.55fr] sm:items-center"><div><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium text-slate-100">{item.company}</span><RiskBadge level={item.risk} /><span className="rounded-md bg-white/[0.045] px-2 py-1 text-[10px] text-slate-500">{item.status}</span></div><p className="mt-2 text-xs text-slate-500">{item.title} · {item.industry}</p><p className="mt-1.5 text-[10px] text-slate-600">下一步：{item.nextAction}</p></div><div><p className="numeric text-sm text-slate-200">{item.amount}</p><p className="mt-1 text-[10px] text-slate-600">{item.id}</p></div><div><div className="flex justify-between text-[10px] text-slate-500"><span>研判完整度</span><span>{item.progress}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-cyan-300" style={{ width: `${item.progress}%` }} /></div></div><div className="flex items-center justify-between text-xs text-slate-400"><span>{item.owner}</span><ArrowRight className="h-4 w-4 opacity-0 transition group-hover:translate-x-1 group-hover:opacity-100" /></div></button>)}
        {cases.length === 0 && <EmptyStateCard title={items.length === 0 ? "还没有企业项目" : "没有匹配的项目"} description={items.length === 0 ? "从一个真实的企业经营、融资或风险研判任务开始，工作区不会自动填充任何示例数据。" : "请调整搜索词或风险筛选条件。"} action={items.length === 0 ? <button onClick={() => setCreateOpen(true)} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">新建首个项目</button> : undefined} />}
      </div>
    </Panel>
    <EnterpriseDialog open={createOpen} onClose={() => setCreateOpen(false)} title="新建企业研判项目" description="创建后可继续上传资料并配置适用规则">
      <form onSubmit={submit} className="space-y-4">{[["company", "企业名称", "填写企业全称"], ["title", "研判任务", "填写本次研判目标"], ["industry", "所属行业", "填写企业所属行业"], ["amount", "融资金额", "填写金额或注明不适用"], ["owner", "负责人", "填写项目负责人"]].map(([name, label, placeholder]) => <label key={name} className="block"><span className="mb-1.5 block text-[11px] text-slate-400">{label}</span><input required name={name} placeholder={placeholder} className="field-control" /></label>)}<div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setCreateOpen(false)} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-400">取消</button><button type="submit" className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">创建并进入研判</button></div></form>
    </EnterpriseDialog>
    <EnterpriseDialog open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.company ?? "项目详情"} description={selected?.id}>
      {selected && <div><div className="flex items-center gap-2"><RiskBadge level={selected.risk} /><span className="rounded-md bg-white/[0.05] px-2 py-1 text-[10px] text-slate-400">{selected.status}</span></div><h3 className="mt-4 text-base font-semibold text-white">{selected.title}</h3><div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div className="rounded-xl border border-white/[0.07] p-3"><p className="text-slate-600">融资金额</p><p className="numeric mt-2 text-slate-200">{selected.amount}</p></div><div className="rounded-xl border border-white/[0.07] p-3"><p className="text-slate-600">负责人</p><p className="mt-2 text-slate-200">{selected.owner}</p></div></div><div className="mt-4 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] p-3 text-xs text-cyan-100/70"><CheckCircle2 className="mr-2 inline h-4 w-4" />下一步：{selected.nextAction}</div></div>}
    </EnterpriseDialog>
  </div>;
}
