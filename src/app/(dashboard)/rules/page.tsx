"use client";

import { type FormEvent, useState } from "react";
import { CheckCircle2, FileDiff, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import EnterpriseDialog from "@/components/enterprise/EnterpriseDialog";
import { EmptyStateCard, PageIntro, Panel } from "@/components/enterprise/EnterpriseUI";
import { useEnterpriseStore } from "@/store/enterprise-store";

export default function RulesPage() {
  const allRules = useEnterpriseStore((state) => state.rules);
  const addRule = useEnterpriseStore((state) => state.addRule);
  const testRule = useEnterpriseStore((state) => state.testRule);
  const deleteRule = useEnterpriseStore((state) => state.deleteRule);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rules = allRules.filter((rule) => `${rule.code}${rule.name}${rule.domain}`.toLowerCase().includes(query.toLowerCase()));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    // 可选触发条件：填写「指标 + 阈值」后，资料研判由确定性规则引擎评估命中
    //（比较算子固定，避免自由文本条件无法判定）。
    const metric = String(data.get("metric") || "").trim();
    const value = Number(data.get("value"));
    const conditions = metric && Number.isFinite(value) && value !== 0
      ? [{ metric, op: String(data.get("op") || "lt") as "lt" | "lte" | "gt" | "gte" | "eq", value }]
      : undefined;
    addRule({ code: String(data.get("code")), name: String(data.get("name")), domain: String(data.get("domain")), conditions });
    setOpen(false);
  };
  const metrics = [
    [ShieldCheck, allRules.filter((rule) => rule.coverage !== "待测试").length, "已测试规则"],
    [CheckCircle2, allRules.length, "规则总数"],
    [FileDiff, allRules.filter((rule) => rule.coverage === "待测试").length, "待测试规则"],
    [Search, rules.length, "当前筛选结果"],
  ] as const;

  return <div className="page-shell">
    <PageIntro eyebrow="Policy & rules" title="企业金融规则库" description="把准入制度、审查要点与监管要求转化为可版本化、可测试、可解释的机器规则，并保留原制度依据。" actions={<button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]"><Plus className="h-3.5 w-3.5" />新建规则</button>} />
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{metrics.map(([Icon, value, label]) => <div key={label} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"><Icon className="h-4 w-4 text-cyan-300" /><p className="numeric mt-3 text-2xl font-semibold text-white">{value}</p><p className="mt-1 text-[11px] text-slate-500">{label}</p></div>)}</div>
    <Panel>
      <div className="flex flex-col gap-3 border-b border-white/[0.07] p-4 sm:flex-row sm:items-center"><label className="flex flex-1 items-center gap-2 rounded-xl border border-white/[0.08] bg-black/10 px-3"><Search className="h-3.5 w-3.5 text-slate-600" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索规则编号、名称或业务域" className="h-10 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-slate-600" /></label><span className="text-[10px] text-slate-600">本地工作区自动保存</span></div>
      <div className="divide-y divide-white/[0.06]">
        {rules.map((rule) => <div key={rule.id} className="grid gap-3 px-5 py-5 text-left transition hover:bg-white/[0.025] sm:grid-cols-[.55fr_1.5fr_.7fr_.5fr_.9fr] sm:items-center"><div><span className="rounded-md border border-cyan-400/15 bg-cyan-400/[0.06] px-2 py-1 text-[10px] font-semibold text-cyan-300">{rule.code}</span></div><div><p className="text-xs font-medium text-slate-200">{rule.name}</p><p className="mt-1 text-[10px] text-slate-600">更新于 {rule.updated} · {rule.coverage === "待测试" ? "尚未完成验证" : "已完成验证"}</p></div><span className="text-xs text-slate-400">{rule.domain}</span><span className="numeric text-xs text-slate-500">{rule.version}</span><div>{rule.coverage === "待测试" ? <button onClick={() => testRule(rule.id)} className="rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-2.5 py-1.5 text-[10px] text-amber-200 transition hover:bg-amber-400/[0.12]">标记为已测试</button> : <div className="flex justify-between text-[10px] text-slate-600"><span>覆盖度</span><span>{rule.coverageRate}%</span></div>}<div className="mt-1.5 h-1 rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${rule.coverageRate}%` }} /></div></div><button onClick={() => deleteRule(rule.id)} title="删除规则" className="justify-self-end rounded-lg p-1.5 text-slate-600 transition hover:bg-rose-400/10 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button></div>)}
        {rules.length === 0 && <EmptyStateCard title={allRules.length === 0 ? "还没有业务规则" : "没有匹配的规则"} description={allRules.length === 0 ? "根据企业适用制度创建真实规则。新增规则默认标记为“待测试”，不会生成虚假的覆盖率或命中次数。" : "请调整搜索条件。"} action={allRules.length === 0 ? <button onClick={() => setOpen(true)} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">新建首条规则</button> : undefined} />}
      </div>
    </Panel>
    <EnterpriseDialog open={open} onClose={() => setOpen(false)} title="新建业务规则" description="规则将先进入待测试状态">
      <form onSubmit={submit} className="space-y-4">{[["code", "规则编号", "填写内部规则编号"], ["name", "规则名称", "填写制度或审查要求"], ["domain", "业务领域", "填写规则适用业务"]].map(([name, label, placeholder]) => <label key={name} className="block"><span className="mb-1.5 block text-[11px] text-slate-400">{label}</span><input required name={name} placeholder={placeholder} className="field-control" /></label>)}<div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><p className="text-[11px] font-semibold text-slate-300">触发条件（可选，填写后由规则引擎自动判定命中）</p><div className="mt-3 grid grid-cols-3 gap-2"><label className="block"><span className="mb-1 block text-[10px] text-slate-500">事实指标</span><input name="metric" placeholder="如 货币资金" className="field-control" /></label><label className="block"><span className="mb-1 block text-[10px] text-slate-500">比较</span><select name="op" className="field-control"><option value="lt">低于</option><option value="lte">不高于</option><option value="gt">高于</option><option value="gte">不低于</option></select></label><label className="block"><span className="mb-1 block text-[10px] text-slate-500">阈值（元）</span><input name="value" type="number" placeholder="2000000" className="field-control" /></label></div></div><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-400">取消</button><button type="submit" className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">保存规则</button></div></form>
    </EnterpriseDialog>
  </div>;
}
