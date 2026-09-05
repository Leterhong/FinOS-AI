"use client";

import { type FormEvent, useState } from "react";
import { formatWhen } from "@/lib/relative-time";
import { CheckCircle2, FileDiff, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import EnterpriseDialog from "@/components/enterprise/EnterpriseDialog";
import { EmptyStateCard, PageIntro, Panel } from "@/components/enterprise/EnterpriseUI";
import { useEnterpriseStore } from "@/store/enterprise-store";
import { evaluateRule, type FactCandidate } from "@/lib/rule-engine";
import type { EnterpriseRule } from "@/types/enterprise";

export default function RulesPage() {
  const allRules = useEnterpriseStore((state) => state.rules);
  const addRule = useEnterpriseStore((state) => state.addRule);
  const testRule = useEnterpriseStore((state) => state.testRule);
  const deleteRule = useEnterpriseStore((state) => state.deleteRule);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [formNotice, setFormNotice] = useState("");
  const [thresholdHint, setThresholdHint] = useState("");
  const [testingRule, setTestingRule] = useState<EnterpriseRule | null>(null);
  const [deletingRule, setDeletingRule] = useState<EnterpriseRule | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const rules = allRules.filter((rule) => `${rule.code}${rule.name}${rule.domain}`.toLowerCase().includes(query.toLowerCase()));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    // 可选触发条件：填写「指标 + 阈值」后，资料研判由确定性规则引擎评估命中
    //（比较算子固定，避免自由文本条件无法判定）。
    const metric = String(data.get("metric") || "").trim();
    const rawValue = String(data.get("value") || "").trim();
    const value = Number(rawValue);
    if (metric && rawValue !== "" && !Number.isFinite(value)) {
      setFormNotice("已填写事实指标但阈值无效：请输入数字（单位：元），否则触发条件不会保存。");
      return;
    }
    const conditions = metric && rawValue !== "" && Number.isFinite(value)
      ? [{ metric, op: String(data.get("op") || "lt") as "lt" | "lte" | "gt" | "gte" | "eq", value }]
      : undefined;
    addRule({ code: String(data.get("code")), name: String(data.get("name")), domain: String(data.get("domain")), version: String(data.get("version") || "v1.0"), conditions });
    setFormNotice("");
    setOpen(false);
  };
  const submitTest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const condition = testingRule?.conditions?.[0];
    if (!testingRule || !condition) return;
    const data = new FormData(event.currentTarget);
    const unit = String(data.get("unit")) as FactCandidate["unit"];
    const actualValue = Number(data.get("actualValue"));
    const quote = String(data.get("quote"));
    const outcome = evaluateRule([{ topic: condition.metric, value: actualValue, unit, quote }], condition);
    const expectedHit = String(data.get("expectedHit")) === "true";
    testRule(testingRule.id, {
      metric: condition.metric,
      actualValue,
      unit,
      expectedHit,
      actualHit: outcome.hit,
      passed: outcome.hit === expectedHit,
      quote,
      tester: String(data.get("tester")),
    });
    setTestingRule(null);
  };
  const metrics = [
    [ShieldCheck, allRules.filter((rule) => rule.coverage === "已测试").length, "已测试规则"],
    [CheckCircle2, allRules.length, "规则总数"],
    [FileDiff, allRules.filter((rule) => rule.coverage === "待测试").length, "待测试规则"],
    [Search, rules.length, "当前筛选结果"],
  ] as const;

  return <div className="page-shell">
    <PageIntro eyebrow="Policy & rules" title="企业金融规则库" description="把准入制度、审查要点与监管要求转化为可版本化、可测试、可解释的机器规则，并保留原制度依据。" actions={<button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]"><Plus className="h-3.5 w-3.5" />新建规则</button>} />
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{metrics.map(([Icon, value, label]) => <div key={label} className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4"><Icon className="h-4 w-4 text-cyan-300" /><p className="numeric mt-3 text-2xl font-semibold text-white">{value}</p><p className="mt-1 text-[11px] text-slate-500">{label}</p></div>)}</div>
    <Panel>
      <div className="flex flex-col gap-3 border-b border-white/[0.07] p-4 sm:flex-row sm:items-center"><label className="flex flex-1 items-center gap-2 rounded-xl border border-white/[0.08] bg-black/10 px-3"><Search className="h-3.5 w-3.5 text-slate-600" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索规则编号、名称或业务域" className="h-10 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-slate-600" /></label><span className="text-[10px] text-slate-600">本地工作区自动保存</span></div>
      <div className="divide-y divide-white/[0.06]">
        {rules.map((rule) => (
          <div
            key={rule.id}
            onClick={() => setExpandedId(expandedId === rule.id ? null : rule.id)}
            className="cursor-pointer grid gap-3 px-5 py-5 text-left transition hover:bg-white/[0.025] sm:grid-cols-[.55fr_1.5fr_.7fr_.5fr_.9fr] sm:items-center"
          >
            <div><span className="rounded-md border border-cyan-400/15 bg-cyan-400/[0.06] px-2 py-1 text-[10px] font-semibold text-cyan-300">{rule.code}</span></div>
            <div>
              <p className="text-xs font-medium text-slate-200">{rule.name}</p>
              <p className="mt-1 text-[10px] text-slate-600">更新于 {formatWhen(rule.updated)} · {rule.coverage} · {rule.testRecords?.length ?? 0} 个测试样本</p>
            </div>
            <span className="text-xs text-slate-400">{rule.domain}</span>
            <span className="numeric text-xs text-slate-500">{rule.version}</span>
            <div>
              {rule.conditions?.length ? (
                <button
                  onClick={(event) => { event.stopPropagation(); setTestingRule(rule); }}
                  className="rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-2.5 py-1.5 text-[10px] text-amber-200 transition hover:bg-amber-400/[0.12]"
                >
                  运行测试样本
                </button>
              ) : (
                <span className="text-[9px] text-slate-600">缺少结构化条件，不能自动测试</span>
              )}
              <div className="mt-2 flex justify-between text-[10px] text-slate-600"><span>通过率</span><span>{rule.coverageRate}%</span></div>
              <div className="mt-1.5 h-1 rounded-full bg-white/[0.07]">
                <div className={`h-full rounded-full transition-all ${rule.coverage === "测试未通过" ? "bg-rose-400" : "bg-emerald-400"}`} style={{ width: `${rule.coverageRate}%` }} />
              </div>
            </div>
            <button
              onClick={(event) => { event.stopPropagation(); setDeletingRule(rule); }}
              title="删除规则"
              aria-label={`删除规则 ${rule.code}`}
              className="justify-self-end rounded-lg p-1.5 text-slate-600 transition hover:bg-rose-400/10 hover:text-rose-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            {expandedId === rule.id && (rule.conditions?.length ?? 0) > 0 && (
              <div className="col-span-full rounded-xl border border-white/[0.07] bg-black/20 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[.15em] text-slate-600">决策逻辑（Visual View）</p>
                <div className="mt-3 space-y-1.5 text-xs text-slate-300">
                  {rule.conditions!.map((condition, index) => (
                    <div key={index} className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-cyan-400/20 bg-cyan-400/[0.05] px-2 py-0.5 text-[9px] font-semibold text-cyan-300">{index === 0 ? "IF" : "AND"}</span>
                      <span className="text-slate-200">{condition.metric}</span>
                      <span className="text-[10px] text-slate-500">{condition.op === "lt" ? "<" : condition.op === "lte" ? "≤" : condition.op === "gt" ? ">" : condition.op === "gte" ? "≥" : "="}</span>
                      <span className="numeric text-amber-200">{condition.value.toLocaleString()} 元</span>
                    </div>
                  ))}
                  <p className="pt-1 text-[10px] text-slate-600">THEN · 满足全部条件时生成风险信号，由规则引擎对已抽取事实确定性判定。</p>
                </div>
              </div>
            )}
          </div>
        ))}
        {rules.length === 0 && <EmptyStateCard title={allRules.length === 0 ? "还没有业务规则" : "没有匹配的规则"} description={allRules.length === 0 ? "根据企业适用制度创建真实规则。新增规则默认标记为“待测试”，不会生成虚假的覆盖率或命中次数。" : "请调整搜索条件。"} action={allRules.length === 0 ? <button onClick={() => setOpen(true)} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">新建首条规则</button> : undefined} />}
      </div>
    </Panel>
    <EnterpriseDialog open={open} onClose={() => setOpen(false)} title="新建业务规则" description="规则将先进入待测试状态">
      <form onSubmit={submit} className="space-y-4">{formNotice && <p className="rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2 text-[10px] text-amber-200">{formNotice}</p>}<div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">规则编号</span><input required name="code" placeholder="填写内部规则编号" className="field-control" /></label><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">规则版本</span><input required name="version" defaultValue="v1.0" placeholder="如 v1.0" className="field-control" /></label></div>{[["name", "规则名称", "填写制度或审查要求"], ["domain", "业务领域", "填写规则适用业务"]].map(([name, label, placeholder]) => <label key={name} className="block"><span className="mb-1.5 block text-[11px] text-slate-400">{label}</span><input required name={name} placeholder={placeholder} className="field-control" /></label>)}<div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><p className="text-[11px] font-semibold text-slate-300">触发条件（可选，填写后由规则引擎自动判定命中）</p><div className="mt-3 grid grid-cols-3 gap-2"><label className="block"><span className="mb-1 block text-[10px] text-slate-500">事实指标</span><input name="metric" placeholder="如 货币资金" className="field-control" /></label><label className="block"><span className="mb-1 block text-[10px] text-slate-500">比较</span><select name="op" className="field-control"><option value="lt">低于</option><option value="lte">不高于</option><option value="gt">高于</option><option value="gte">不低于</option><option value="eq">等于</option></select></label><label className="block"><span className="mb-1 block text-[10px] text-slate-500">阈值（元）</span><input name="value" type="number" step="any" placeholder="2000000" onBlur={(event) => { const v = Number(event.target.value); setThresholdHint(event.target.value !== "" && !Number.isFinite(v) ? "请输入有效数字" : v < 0 ? "阈值不应为负数" : ""); }} className="field-control" />{thresholdHint && <p className="mt-1 text-[9px] text-rose-300">{thresholdHint}</p>}</label></div></div><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-400">取消</button><button type="submit" className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">保存规则</button></div></form>
    </EnterpriseDialog>
    <EnterpriseDialog open={Boolean(testingRule)} onClose={() => setTestingRule(null)} title="运行规则测试样本" description={testingRule ? `${testingRule.code} · ${testingRule.name}` : undefined}><form onSubmit={submitTest} className="space-y-4"><div className="rounded-xl border border-white/[0.07] p-3 text-[10px] leading-5 text-slate-400">条件：{testingRule?.conditions?.[0]?.metric} · {testingRule?.conditions?.[0]?.op} · {testingRule?.conditions?.[0]?.value}</div><div className="grid grid-cols-2 gap-3"><label><span className="mb-1.5 block text-[11px] text-slate-400">测试数值</span><input required type="number" step="any" name="actualValue" className="field-control" /></label><label><span className="mb-1.5 block text-[11px] text-slate-400">单位</span><select name="unit" className="field-control"><option>元</option><option>万元</option><option>亿元</option><option>%</option></select></label></div><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">期望结果</span><select name="expectedHit" className="field-control"><option value="true">应命中</option><option value="false">不应命中</option></select></label><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">测试证据</span><textarea required name="quote" rows={3} placeholder="记录测试样本来源或构造依据" className="field-control resize-none" /></label><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">测试人</span><input required name="tester" placeholder="填写真实测试人" className="field-control" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setTestingRule(null)} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-400">取消</button><button type="submit" className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">执行并保存结果</button></div></form></EnterpriseDialog>
    <EnterpriseDialog open={Boolean(deletingRule)} onClose={() => setDeletingRule(null)} title="确认删除规则" description={deletingRule ? `${deletingRule.code} · ${deletingRule.name}` : undefined}><div className="space-y-4"><p className="text-xs leading-6 text-slate-400">删除后该规则及测试记录将从工作区和服务端备份移除。历史报告中的文字引用不会自动重写。</p><div className="flex justify-end gap-2"><button type="button" onClick={() => setDeletingRule(null)} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-400">取消</button><button type="button" onClick={() => { if (deletingRule) deleteRule(deletingRule.id); setDeletingRule(null); }} className="rounded-xl bg-rose-400 px-4 py-2.5 text-xs font-semibold text-white">确认删除</button></div></div></EnterpriseDialog>
  </div>;
}
