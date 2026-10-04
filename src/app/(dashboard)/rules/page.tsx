"use client";

import { type FormEvent, useMemo, useState } from "react";
import { formatWhen } from "@/lib/relative-time";
import { CheckCircle2, FileDiff, Library, Plus, Search, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import EnterpriseDialog from "@/components/enterprise/EnterpriseDialog";
import { Select } from "@/components/ui/Select";
import { Tooltip } from "@/components/ui/Tooltip";
import { EmptyStateCard, PageIntro, Panel } from "@/components/enterprise/EnterpriseUI";
import { useActiveEnterpriseCase } from "@/hooks/use-active-enterprise-case";
import { useEnterpriseStore } from "@/store/enterprise-store";
import { evaluateRule, type FactCandidate } from "@/lib/rule-engine";
import { RULE_TEMPLATES, recommendedTemplates, ruleTemplateGroups, type RuleTemplate } from "@/lib/rule-templates";
import { toast } from "@/components/feedback/toast";
import type { EnterpriseRule } from "@/types/enterprise";

/** 指标阈值单位提示：比率类按 %，其余按元。 */
function conditionUnit(metric: string): string {
  return /率|比|度|占比/.test(metric) ? "%" : "元";
}

export default function RulesPage() {
  const allRules = useEnterpriseStore((state) => state.rules);
  const addRule = useEnterpriseStore((state) => state.addRule);
  const testRule = useEnterpriseStore((state) => state.testRule);
  const deleteRule = useEnterpriseStore((state) => state.deleteRule);
  const updateRule = useEnterpriseStore((state) => state.updateRule);
  const { activeCase } = useActiveEnterpriseCase();
  const [query, setQuery] = useState("");
  const [industryFilter, setIndustryFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [formNotice, setFormNotice] = useState("");
  const [thresholdHint, setThresholdHint] = useState("");
  const [testingRule, setTestingRule] = useState<EnterpriseRule | null>(null);
  const [deletingRule, setDeletingRule] = useState<EnterpriseRule | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateGroup, setTemplateGroup] = useState("全部");
  const rules = allRules
    .filter((rule) => `${rule.code}${rule.name}${rule.domain}`.toLowerCase().includes(query.toLowerCase()))
    .filter((rule) => {
      if (!industryFilter) return true;
      const tags = rule.industries ?? [];
      if (industryFilter === "通用") return tags.length === 0 || tags.includes("通用");
      return tags.includes(industryFilter);
    });
  const recommendation = useMemo(() => recommendedTemplates(activeCase?.industry), [activeCase?.industry]);
  const recommendedPending = recommendation.templates.filter((template) => !allRules.some((rule) => rule.code === template.code));

  const addFromTemplate = (template: RuleTemplate) => {
    if (allRules.some((rule) => rule.code === template.code)) {
      toast.info(`规则 ${template.code} 已存在，已跳过`);
      return;
    }
    addRule({ code: template.code, name: template.name, domain: template.domain, version: "v1.0", conditions: [{ metric: template.metric, op: template.op, value: template.value }], enabled: true, industries: template.industry === "general" ? [] : [template.group] });
    toast.success(`已从模板创建规则：${template.name}`);
  };

  const addRecommended = () => {
    if (!recommendedPending.length) {
      toast.info("推荐规则均已加入规则库");
      return;
    }
    for (const template of recommendedPending) {
      addRule({ code: template.code, name: template.name, domain: template.domain, version: "v1.0", conditions: [{ metric: template.metric, op: template.op, value: template.value }], enabled: true, industries: template.industry === "general" ? [] : [template.group] });
    }
    toast.success(`已加入 ${recommendedPending.length} 条「${recommendation.profile.label}」推荐规则`);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    // 可选触发条件：填写「指标 + 阈值」后，资料研判由确定性规则引擎评估命中
    //（比较算子固定，避免自由文本条件无法判定）。
    const metric = String(data.get("metric") || "").trim();
    const rawValue = String(data.get("value") || "").trim();
    const value = Number(rawValue);
    if (metric && rawValue !== "" && !Number.isFinite(value)) {
      setFormNotice("已填写事实指标但阈值无效：请输入数字（货币默认按元，百分比直接填数字），否则触发条件不会保存。");
      return;
    }
    const conditions = metric && rawValue !== "" && Number.isFinite(value)
      ? [{ metric, op: String(data.get("op") || "lt") as "lt" | "lte" | "gt" | "gte" | "eq", value }]
      : undefined;
    const code = String(data.get("code") || "").trim();
    if (allRules.some((rule) => rule.code === code)) {
      setFormNotice(`规则编号 ${code} 已存在，请使用唯一编号，避免规则命中结果无法追溯。`);
      return;
    }
    addRule({ code, name: String(data.get("name")), domain: String(data.get("domain")), version: String(data.get("version") || "v1.0"), conditions });
    setFormNotice("");
    setOpen(false);
    toast.success(`规则 ${code} 已创建`);
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
    <PageIntro eyebrow="Policy & rules" title="企业金融规则库" description="把准入制度、审查要点与监管要求转化为可版本化、可测试、可解释的机器规则，并保留原制度依据。" actions={<><button onClick={() => setTemplateOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/25 px-4 py-2.5 text-xs text-cyan-200"><Library className="h-3.5 w-3.5" />规则模板</button><button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]"><Plus className="h-3.5 w-3.5" />新建规则</button></>} />
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{metrics.map(([Icon, value, label]) => <div key={label} className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4"><Icon className="h-4 w-4 text-cyan-300" /><p className="numeric mt-3 text-2xl font-semibold text-white">{value}</p><p className="mt-1 text-[11px] text-slate-500">{label}</p></div>)}</div>
    {activeCase && <Panel className="border-cyan-400/20 bg-cyan-400/[0.04]"><div className="flex flex-wrap items-center gap-3 p-4"><Sparkles className="h-4 w-4 shrink-0 text-cyan-300" /><p className="min-w-0 flex-1 text-xs text-cyan-100">当前项目「{activeCase.company}」所属行业：<span className="text-white">{activeCase.industry || "未填写"}</span> → 匹配「{recommendation.profile.label}」分组，推荐 {recommendation.templates.length} 条规则模板{recommendedPending.length > 0 ? `（待加入 ${recommendedPending.length} 条）` : "（已全部加入）"}。</p><button type="button" onClick={() => { setTemplateGroup(recommendation.profile.label); setTemplateOpen(true); }} className="rounded-lg border border-cyan-400/25 px-3 py-1.5 text-[10px] text-cyan-200">查看推荐模板</button><button type="button" onClick={addRecommended} disabled={!recommendedPending.length} className="rounded-lg bg-cyan-300 px-3 py-1.5 text-[10px] font-semibold text-[#041018] disabled:opacity-40">一键加入推荐模板</button></div></Panel>}
    <Panel>
      <div className="flex flex-col gap-3 border-b border-white/[0.07] p-4 sm:flex-row sm:items-center"><label className="flex flex-1 items-center gap-2 rounded-xl border border-white/[0.08] bg-black/10 px-3"><Search className="h-3.5 w-3.5 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索规则编号、名称或业务域" className="h-10 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-slate-400" /></label><div className="flex items-center gap-2"><span className="text-[10px] text-slate-500">适用行业</span><Select value={industryFilter} onChange={setIndustryFilter} className="min-w-36" options={[{ value: "", label: "全部行业" }, ...ruleTemplateGroups().map((group) => ({ value: group, label: group }))]} /></div><span className="text-[10px] text-slate-400">本地工作区自动保存</span></div>
      <div className="divide-y divide-white/[0.06]">
        {rules.map((rule) => (
          <div
            key={rule.id}
            onClick={() => setExpandedId(expandedId === rule.id ? null : rule.id)}
            className="cursor-pointer grid gap-3 px-5 py-5 text-left transition hover:bg-white/[0.025] sm:grid-cols-[.55fr_1.5fr_.7fr_.5fr_.9fr_auto] sm:items-center"
          >
            <div><span className="rounded-md border border-cyan-400/15 bg-cyan-400/[0.06] px-2 py-1 text-[10px] font-semibold text-cyan-300">{rule.code}</span></div>
            <div>
              <p className="text-xs font-medium text-slate-200">{rule.name}</p>
              <p className="mt-1 text-[10px] text-slate-400">更新于 {formatWhen(rule.updated)} · {rule.coverage} · {rule.testRecords?.length ?? 0} 个测试样本</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className={`rounded-md border px-1.5 py-0.5 text-[10px] ${rule.enabled === false ? "border-white/10 text-slate-400" : "border-emerald-400/20 text-emerald-300"}`}>{rule.enabled === false ? "已停用" : "已启用"}</span>
                {(rule.industries ?? []).length === 0 ? <span className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-400">通用</span> : (rule.industries ?? []).map((tag) => <span key={tag} className="rounded-md border border-cyan-400/20 bg-cyan-400/[0.05] px-1.5 py-0.5 text-[10px] text-cyan-200">{tag}</span>)}
              </div>
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
                <span className="text-[10px] text-slate-400">缺少结构化条件，不能自动测试</span>
              )}
              <div className="mt-2 flex justify-between text-[10px] text-slate-400"><span>自测通过率</span><span>{rule.coverageRate}%</span></div>
              <div className="mt-1.5 h-1 rounded-full bg-white/[0.07]">
                <div className={`h-full rounded-full transition-all ${rule.coverage === "测试未通过" ? "bg-rose-400" : "bg-emerald-400"}`} style={{ width: `${rule.coverageRate}%` }} />
              </div>
            </div>
            <Tooltip label="删除规则" className="justify-self-end">
              <button
                onClick={(event) => { event.stopPropagation(); setDeletingRule(rule); }}
                aria-label={`删除规则 ${rule.code}`}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-400/10 hover:text-rose-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
            {expandedId === rule.id && (rule.conditions?.length ?? 0) > 0 && (
              <div className="col-span-full rounded-xl border border-white/[0.07] bg-black/20 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[.15em] text-slate-400">决策逻辑（Visual View）</p>
                <div className="mt-3 space-y-1.5 text-xs text-slate-300">
                  {rule.conditions!.map((condition, index) => (
                    <div key={`${condition.metric}-${index}`} className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md border border-cyan-400/20 bg-cyan-400/[0.05] px-2 py-0.5 text-[10px] font-semibold text-cyan-300">{index === 0 ? "IF" : "AND"}</span>
                      <span className="text-slate-200">{condition.metric}</span>
                      <span className="text-[10px] text-slate-500">{condition.op === "lt" ? "<" : condition.op === "lte" ? "≤" : condition.op === "gt" ? ">" : condition.op === "gte" ? "≥" : "="}</span>
                      <span className="numeric text-amber-200">{condition.value.toLocaleString()} {conditionUnit(condition.metric)}</span>
                    </div>
                  ))}
                  <p className="pt-1 text-[10px] text-slate-400">THEN · 满足全部条件时生成风险信号，由规则引擎对已抽取事实确定性判定。</p>
                </div>
              </div>
            )}
            {expandedId === rule.id && (
              <div className="col-span-full flex flex-wrap items-center gap-2">
                <button type="button" onClick={(event) => { event.stopPropagation(); updateRule(rule.id, { enabled: rule.enabled === false }); }} className={`rounded-lg border px-3 py-1.5 text-[10px] ${rule.enabled === false ? "border-emerald-400/25 text-emerald-300" : "border-white/10 text-slate-400"}`}>{rule.enabled === false ? "启用规则" : "停用规则"}</button>
                <button type="button" onClick={(event) => { event.stopPropagation(); setDeletingRule(rule); }} className="rounded-lg border border-rose-400/20 px-3 py-1.5 text-[10px] text-rose-300">删除规则</button>
                <span className="text-[10px] text-slate-400">停用后该规则不参与资料研判的确定性判定。</span>
              </div>
            )}
          </div>
        ))}
        {rules.length === 0 && <EmptyStateCard title={allRules.length === 0 ? "还没有业务规则" : "没有匹配的规则"} description={allRules.length === 0 ? "根据企业适用制度创建真实规则。新增规则默认标记为“待测试”，不会生成虚假的覆盖率或命中次数。" : "请调整搜索条件。"} action={allRules.length === 0 ? <button onClick={() => setOpen(true)} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">新建首条规则</button> : undefined} />}
      </div>
    </Panel>
    <EnterpriseDialog open={open} onClose={() => setOpen(false)} title="新建业务规则" description="规则将先进入待测试状态">
      <form onSubmit={submit} className="space-y-4">{formNotice && <p className="rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2 text-[10px] text-amber-200">{formNotice}</p>}<div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">规则编号</span><input required name="code" placeholder="填写内部规则编号" className="field-control" /></label><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">规则版本</span><input required name="version" defaultValue="v1.0" placeholder="如 v1.0" className="field-control" /></label></div>{[["name", "规则名称", "填写制度或审查要求"], ["domain", "业务领域", "填写规则适用业务"]].map(([name, label, placeholder]) => <label key={name} className="block"><span className="mb-1.5 block text-[11px] text-slate-400">{label}</span><input required name={name} placeholder={placeholder} className="field-control" /></label>)}<div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"><p className="text-[11px] font-semibold text-slate-300">触发条件（可选，填写后由规则引擎自动判定命中）</p><div className="mt-3 grid grid-cols-3 gap-2"><label className="block"><span className="mb-1 block text-[10px] text-slate-500">事实指标</span><input name="metric" placeholder="如 货币资金" className="field-control" /></label><label className="block"><span className="mb-1 block text-[10px] text-slate-500">比较</span><Select name="op" defaultValue="lt" options={[{ value: "lt", label: "低于" }, { value: "lte", label: "不高于" }, { value: "gt", label: "高于" }, { value: "gte", label: "不低于" }, { value: "eq", label: "等于" }]} /></label><label className="block"><span className="mb-1 block text-[10px] text-slate-500">阈值（货币按元，百分比填数字）</span><input name="value" type="number" step="any" placeholder="2000000" onBlur={(event) => { const v = Number(event.target.value); setThresholdHint(event.target.value !== "" && !Number.isFinite(v) ? "请输入有效数字" : v < 0 ? "阈值不应为负数" : ""); }} className="field-control" />{thresholdHint && <p className="mt-1 text-[10px] text-rose-300">{thresholdHint}</p>}</label></div></div><div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-400">取消</button><button type="submit" className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">保存规则</button></div></form>
    </EnterpriseDialog>
    <EnterpriseDialog open={Boolean(testingRule)} onClose={() => setTestingRule(null)} title="运行规则测试样本" description={testingRule ? `${testingRule.code} · ${testingRule.name}` : undefined}><form onSubmit={submitTest} className="space-y-4"><div className="rounded-xl border border-white/[0.07] p-3 text-[10px] leading-5 text-slate-400">条件：{testingRule?.conditions?.[0]?.metric} · {testingRule?.conditions?.[0]?.op} · {testingRule?.conditions?.[0]?.value}</div><div className="grid grid-cols-2 gap-3"><label><span className="mb-1.5 block text-[11px] text-slate-400">测试数值</span><input required type="number" step="any" name="actualValue" className="field-control" /></label><label><span className="mb-1.5 block text-[11px] text-slate-400">单位</span><Select name="unit" defaultValue="元" options={[{ value: "元", label: "元" }, { value: "万元", label: "万元" }, { value: "亿元", label: "亿元" }, { value: "%", label: "%" }]} /></label></div><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">期望结果</span><Select name="expectedHit" defaultValue="true" options={[{ value: "true", label: "应命中" }, { value: "false", label: "不应命中" }]} /></label><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">测试证据</span><textarea required name="quote" rows={3} placeholder="记录测试样本来源或构造依据" className="field-control resize-none" /></label><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">测试人</span><input required name="tester" placeholder="填写真实测试人" className="field-control" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setTestingRule(null)} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-400">取消</button><button type="submit" className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">执行并保存结果</button></div></form></EnterpriseDialog>
    <EnterpriseDialog open={Boolean(deletingRule)} onClose={() => setDeletingRule(null)} title="确认删除规则" description={deletingRule ? `${deletingRule.code} · ${deletingRule.name}` : undefined}><div className="space-y-4"><p className="text-xs leading-6 text-slate-400">删除后该规则及测试记录将从工作区和服务端备份移除。历史报告中的文字引用不会自动重写。</p><div className="flex justify-end gap-2"><button type="button" onClick={() => setDeletingRule(null)} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-400">取消</button><button type="button" onClick={() => { if (deletingRule) deleteRule(deletingRule.id); setDeletingRule(null); }} className="rounded-xl bg-rose-400 px-4 py-2.5 text-xs font-semibold text-white">确认删除</button></div></div></EnterpriseDialog>
    <EnterpriseDialog open={templateOpen} onClose={() => setTemplateOpen(false)} title="规则模板库" description="按行业/通用选择模板一键加入规则库（生成普通规则，可继续编辑或删除）。阈值仅作风险提示，不替代授信政策。">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-slate-400">分组</span>
          <Select value={templateGroup} onChange={setTemplateGroup} className="min-w-40" options={["全部", ...ruleTemplateGroups()].map((group) => ({ value: group, label: group }))} />
          <span className="text-[10px] text-slate-400">共 {RULE_TEMPLATES.length} 条模板</span>
        </div>
        <div className="scrollbar-thin max-h-[55vh] space-y-2 overflow-y-auto">
          {RULE_TEMPLATES.filter((template) => templateGroup === "全部" || template.group === templateGroup).map((template) => {
            const added = allRules.some((rule) => rule.code === template.code);
            const opLabel = template.op === "lt" ? "<" : template.op === "lte" ? "≤" : template.op === "gt" ? ">" : template.op === "gte" ? "≥" : "=";
            return <div key={template.id} className="rounded-xl border border-white/[0.07] p-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-200">{template.code} · {template.name}</p>
                  <p className="mt-1 text-[10px] text-slate-400">{template.group} · {template.metric} {opLabel} {template.value}{conditionUnit(template.metric)} · {template.note}</p>
                  <p className="mt-1.5 text-[10px] leading-5 text-slate-500">{template.description}</p>
                  <div className="mt-2 grid gap-1 text-[10px] leading-5 text-slate-500">
                    <p><span className="text-slate-400">口径依据：</span>{template.basis}</p>
                    <p><span className="text-slate-400">潜在影响：</span>{template.impact}</p>
                    <p><span className="text-slate-400">复核建议：</span>{template.suggestion}</p>
                  </div>
                </div>
                <button type="button" onClick={() => addFromTemplate(template)} disabled={added} className="shrink-0 rounded-lg border border-cyan-400/25 px-3 py-1.5 text-[10px] text-cyan-200 disabled:opacity-40">{added ? "已加入" : "加入规则库"}</button>
              </div>
            </div>;
          })}
        </div>
      </div>
    </EnterpriseDialog>
  </div>;
}
