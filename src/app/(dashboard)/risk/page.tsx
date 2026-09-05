"use client";

import { type FormEvent, useState } from "react";
import { Download, CheckCircle2, Plus, ShieldAlert, ShieldCheck } from "lucide-react";
import EnterpriseDialog from "@/components/enterprise/EnterpriseDialog";
import DetailDrawer, { DrawerSection } from "@/components/workspace/DetailDrawer";
import { EmptyStateCard, PageIntro, Panel, RiskBadge, riskMeta } from "@/components/enterprise/EnterpriseUI";
import { useEnterpriseStore } from "@/store/enterprise-store";
import type { RiskLevel, RiskSignal } from "@/types/enterprise";

export default function RiskPage() {
  const cases = useEnterpriseStore((state) => state.cases);
  const risks = useEnterpriseStore((state) => state.risks);
  const addRisk = useEnterpriseStore((state) => state.addRisk);
  const verifyRisk = useEnterpriseStore((state) => state.verifyRisk);
  const mitigateRisk = useEnterpriseStore((state) => state.mitigateRisk);
  const [exported, setExported] = useState(false);
  const [drawerRiskId, setDrawerRiskId] = useState<string | null>(null);
  const drawerRisk = drawerRiskId ? risks.find((item) => item.id === drawerRiskId) ?? null : null;
  const [level, setLevel] = useState("all");
  const [open, setOpen] = useState(false);
  const [reviewing, setReviewing] = useState<{ risk: RiskSignal; mode: "verify" | "mitigate" } | null>(null);
  const filtered = risks.filter((risk) => level === "all" || (level === "pending" ? risk.status === "待核验" : risk.level === level));
  const filters = [
    ["全部信号", risks.length, "all"],
    ["重大风险", risks.filter((risk) => risk.level === "critical").length, "critical"],
    ["高风险", risks.filter((risk) => risk.level === "high").length, "high"],
    ["待人工核验", risks.filter((risk) => risk.status === "待核验").length, "pending"],
  ] as const;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const caseId = String(data.get("caseId"));
    const relatedCase = cases.find((item) => item.id === caseId);
    if (!relatedCase) return;
    addRisk({
      caseId,
      company: relatedCase.company,
      title: String(data.get("title")),
      level: String(data.get("level")) as RiskLevel,
      evidence: String(data.get("evidence")),
      rule: String(data.get("rule")),
      impact: String(data.get("impact")),
    });
    setOpen(false);
  };

  const submitReview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!reviewing) return;
    const data = new FormData(event.currentTarget);
    const input = { reviewer: String(data.get("reviewer")), note: String(data.get("note")) };
    if (reviewing.mode === "verify") verifyRisk(reviewing.risk.id, input);
    else mitigateRisk(reviewing.risk.id, input);
    setReviewing(null);
  };

  const exportRisks = () => {
    const nl = String.fromCharCode(10);
    const lines = filtered.map((s) => [
      `## ${s.title}`,
      `- 主体：${s.company}`,
      `- 等级：${s.level} · 状态：${s.status}`,
      `- 证据：${s.evidence}`,
      `- 规则依据：${s.rule}`,
      `- 潜在影响：${s.impact}`,
      s.verifiedBy ? `- 复核：${s.verifiedBy}` : "",
    ].filter(Boolean).join(nl));
    const text = ["# 企业风险清单", "", ...lines, "", `（共 ${filtered.length} 项；AI 输出需人工复核，不构成授信、投资、法律、审计或合规意见）`].join(nl);
    void navigator.clipboard?.writeText(text).then(() => {
      setExported(true);
      setTimeout(() => setExported(false), 2000);
    });
  };
  return <div className="page-shell">
    <PageIntro eyebrow="Risk intelligence" title="企业风险中心" description="风险提示必须同时呈现事实证据、命中规则、潜在影响与核验状态，避免黑箱评分和无依据结论。" actions={<><button type="button" onClick={exportRisks} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-300 hover:border-cyan-400/25 hover:text-cyan-200"><Download className="h-3.5 w-3.5" />{exported ? "已复制" : "复制风险清单"}</button><button disabled={cases.length === 0} onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018] disabled:cursor-not-allowed disabled:opacity-40"><Plus className="h-3.5 w-3.5" />登记风险</button></>} />
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{filters.map(([label, count, value]) => <button key={value} onClick={() => setLevel(value)} className={`rounded-xl border p-4 text-left transition ${level === value ? "border-cyan-300/25 bg-cyan-300/[0.07]" : "border-white/[0.08] bg-white/[0.025] hover:bg-white/[0.04]"}`}><p className="text-xs text-slate-500">{label}</p><p className="numeric mt-2 text-2xl font-semibold text-white">{count}</p></button>)}</div>
    <Panel>
      <div className="divide-y divide-white/[0.07]">
        {filtered.map((signal) => <article key={signal.id} className="grid gap-4 p-5 lg:grid-cols-[1.1fr_1fr_.72fr]"><div><div className="flex items-center gap-2"><RiskBadge level={signal.level} /><span className="text-[10px] text-slate-600">{signal.id}</span></div><button type="button" onClick={() => setDrawerRiskId(signal.id)} className="mt-3 block text-left text-sm font-semibold text-slate-100 transition hover:text-cyan-200">{signal.title}</button><p className="mt-1.5 text-xs text-slate-500">{signal.company}{cases.find((item) => item.id === signal.caseId) ? ` · ${cases.find((item) => item.id === signal.caseId)!.title}` : ""}</p><div className="mt-3 flex flex-wrap items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${riskMeta[signal.level].dot}`} /><span className="text-[11px] text-slate-400">{signal.status === "待核验" ? "候选风险 · 待人工核验" : signal.status}</span>{signal.origin && <span className="rounded-md border border-white/[0.07] px-2 py-1 text-[9px] text-slate-600">{signal.origin}</span>}</div>{signal.sourceRunId && <p className="mt-2 text-[9px] text-slate-700">来源运行：{signal.sourceRunId}</p>}</div><div className="rounded-xl border border-white/[0.06] bg-black/10 p-3.5"><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-slate-600">关键证据</p><p className="mt-2 text-xs leading-5 text-slate-300">{signal.evidence}</p><p className="mt-3 text-[10px] text-cyan-300/70">规则依据：{signal.rule}</p>{(signal.factIds?.length || signal.ruleCodes?.length) && <p className="mt-2 text-[9px] text-slate-600">事实引用：{signal.factIds?.join("、") || "无"}<br />规则引用：{signal.ruleCodes?.join("、") || "无"}</p>}{signal.verifiedBy && <div className="mt-3 border-t border-white/[0.06] pt-2 text-[9px] leading-5 text-emerald-200/60">复核：{signal.verifiedBy} · {signal.verifiedAt ? new Date(signal.verifiedAt).toLocaleString("zh-CN") : ""}<br />{signal.verificationNote}</div>}</div><div className="flex flex-col"><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-slate-600">潜在影响</p><p className="mt-2 text-xs leading-5 text-slate-300">{signal.impact}</p>{signal.mitigationNote && <p className="mt-3 text-[9px] leading-5 text-emerald-200/60">缓释记录：{signal.mitigationNote}</p>}<div className="mt-auto space-y-2"><button onClick={() => setReviewing({ risk: signal, mode: "verify" })} disabled={signal.status !== "待核验"} className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[11px] text-slate-300 disabled:border-emerald-400/15 disabled:text-emerald-300"><CheckCircle2 className="h-3 w-3" />{signal.status === "待核验" ? "人工核验候选风险" : "已完成核验"}</button>{signal.status === "已确认" && <button onClick={() => setReviewing({ risk: signal, mode: "mitigate" })} className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-400/15 bg-emerald-400/[0.05] px-3 py-2 text-[11px] text-emerald-200 transition hover:bg-emerald-400/[0.1]"><ShieldCheck className="h-3 w-3" />登记缓释措施</button>}</div></div></article>)}
        {filtered.length === 0 && <EmptyStateCard title={risks.length === 0 ? "还没有风险信号" : "当前筛选没有结果"} description={cases.length === 0 ? "先创建企业项目，再基于真实证据登记风险。AI Agent 的研判结果也会保留在运行记录中，供人工核验后入库。" : "登记风险时必须填写证据、规则依据和潜在影响；系统不会预置虚假风险。"} action={cases.length > 0 && risks.length === 0 ? <button onClick={() => setOpen(true)} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">登记首个风险</button> : undefined} />}
      </div>
    </Panel>
    <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-4 text-xs leading-5 text-amber-100/70"><ShieldAlert className="mr-2 inline h-4 w-4" />风险信号用于辅助研判，不直接替代授信、投资或合规决策；所有重大结论需由有权限的业务人员复核。</div>
    <DetailDrawer
      open={Boolean(drawerRisk)}
      onClose={() => setDrawerRiskId(null)}
      title={drawerRisk?.title ?? ""}
      subtitle={drawerRisk ? `${drawerRisk.company} · ${drawerRisk.level} · ${drawerRisk.status}` : ""}
    >
      {drawerRisk && <>
        <DrawerSection label="What · 发生了什么">
          <p>{drawerRisk.title}</p>
          <p className="mt-1 text-slate-500">{drawerRisk.company}</p>
        </DrawerSection>
        <DrawerSection label="Severity · 等级">
          <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] ${riskMeta[drawerRisk.level].className}`}>{riskMeta[drawerRisk.level].label}风险</span>
        </DrawerSection>
        <DrawerSection label="Evidence · 证据">
          <p>「{drawerRisk.evidence}」</p>
          {drawerRisk.factIds?.length ? <p className="mt-1 text-[10px] text-slate-600">关联事实：{drawerRisk.factIds.join("、")}</p> : null}
        </DrawerSection>
        <DrawerSection label="Matched Rule · 命中规则">
          <p>{drawerRisk.rule}</p>
        </DrawerSection>
        <DrawerSection label="Impact · 潜在影响">
          <p>{drawerRisk.impact}</p>
        </DrawerSection>
        <DrawerSection label="Human Review · 人工复核">
          {drawerRisk.status === "待核验" ? (
            <p className="text-amber-300">候选风险，等待人工核验</p>
          ) : (
            <p>
              {drawerRisk.status}
              {drawerRisk.verifiedBy ? ` · ${drawerRisk.verifiedBy}` : ""}
              {drawerRisk.verifiedAt ? ` · ${new Date(drawerRisk.verifiedAt).toLocaleString("zh-CN")}` : ""}
              {drawerRisk.verificationNote ? <span className="mt-1 block text-slate-500">{drawerRisk.verificationNote}</span> : null}
              {drawerRisk.mitigationNote ? <span className="mt-1 block text-emerald-200/70">{drawerRisk.mitigationNote}</span> : null}
            </p>
          )}
        </DrawerSection>
        <DrawerSection label="Traceability · 溯源">
          <p className="text-[10px] text-slate-600">
            来源：{drawerRisk.origin || "人工登记"}
            {drawerRisk.sourceRunId ? ` · 运行 ${drawerRisk.sourceRunId}` : ""}
            {drawerRisk.ruleCodes?.length ? ` · 规则 ${drawerRisk.ruleCodes.join("、")}` : ""}
          </p>
        </DrawerSection>
      </>}
    </DetailDrawer>
    <EnterpriseDialog open={open} onClose={() => setOpen(false)} title="登记企业风险" description="仅录入可追溯、可复核的风险信号">
      <form onSubmit={submit} className="space-y-4">
        <label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">关联项目</span><select required name="caseId" className="field-control"><option value="">选择项目</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.company} · {item.title}</option>)}</select></label>
        {["title", "evidence", "rule", "impact"].map((name) => { const meta: Record<string, [string, string]> = { title: ["风险标题", "概括需要核验的风险"], evidence: ["关键证据", "填写原始资料中的事实与位置"], rule: ["规则依据", "填写命中的制度或审查规则"], impact: ["潜在影响", "说明对经营、融资或合规的影响"] }; return <label key={name} className="block"><span className="mb-1.5 block text-[11px] text-slate-400">{meta[name][0]}</span><textarea required name={name} rows={name === "title" ? 2 : 3} placeholder={meta[name][1]} className="field-control resize-none" /></label>; })}
        <label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">风险等级</span><select name="level" className="field-control"><option value="medium">中风险</option><option value="high">高风险</option><option value="critical">重大风险</option><option value="low">低风险</option></select></label>
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-400">取消</button><button type="submit" className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">保存并待核验</button></div>
      </form>
    </EnterpriseDialog>
    <EnterpriseDialog open={Boolean(reviewing)} onClose={() => setReviewing(null)} title={reviewing?.mode === "mitigate" ? "登记风险缓释" : "人工核验候选风险"} description={reviewing?.risk.title}><form onSubmit={submitReview} className="space-y-4"><div className="rounded-xl border border-amber-400/10 bg-amber-400/[0.035] p-3 text-[10px] leading-5 text-amber-100/60">{reviewing?.mode === "verify" ? "确认后该候选风险会进入正式风险台账。请对照原始资料和适用规则，不要只依据模型文字。" : "记录已经实际采取或确认的缓释措施，不能用计划中的动作冒充已完成。"}</div><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">操作人</span><input required name="reviewer" placeholder="填写真实姓名或工号" className="field-control" /></label><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">{reviewing?.mode === "verify" ? "核验意见" : "缓释措施与依据"}</span><textarea required name="note" rows={4} placeholder="记录核验依据、修正内容或实际缓释动作" className="field-control resize-none" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setReviewing(null)} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-400">取消</button><button type="submit" className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">保存审计记录</button></div></form></EnterpriseDialog>
  </div>;
}
