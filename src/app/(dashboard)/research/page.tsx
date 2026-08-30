"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { BookOpenCheck, Cpu, FileSearch, Loader2, SearchCheck, Sparkles } from "lucide-react";
import { EmptyStateCard, PageIntro, Panel, PanelHeader } from "@/components/enterprise/EnterpriseUI";
import EnterpriseDialog from "@/components/enterprise/EnterpriseDialog";
import { callEnterpriseAI } from "@/lib/enterprise-ai";
import { useEnterpriseStore } from "@/store/enterprise-store";
import { useModelStore } from "@/store/model-store";

export default function ResearchPage() {
  const cases = useEnterpriseStore((state) => state.cases);
  const documents = useEnterpriseStore((state) => state.documents);
  const rules = useEnterpriseStore((state) => state.rules);
  const risks = useEnterpriseStore((state) => state.risks);
  const briefs = useEnterpriseStore((state) => state.briefs);
  const addBrief = useEnterpriseStore((state) => state.addBrief);
  const active = useModelStore((state) => state.active);
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!active?.configured || generating) return;
    const data = new FormData(event.currentTarget);
    const topic = String(data.get("topic") || "").trim();
    const scope = String(data.get("scope") || "").trim();
    if (!topic) return;
    setGenerating(true);
    setError("");
    try {
      const result = await callEnterpriseAI({
        mode: "research",
        question: `研究主题：${topic}${scope ? `\n研究范围：${scope}` : ""}`,
        context: { cases, documents, rules, risks },
      });
      addBrief({ topic, title: `${topic} · AI 研究底稿`, summary: result.answer, model: result.model });
      setOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "研究生成失败");
    } finally {
      setGenerating(false);
    }
  };

  return <div className="page-shell">
    <PageIntro eyebrow="AI research workspace" title="企业投研中心" description="使用当前默认模型基于工作区上下文生成研究框架和底稿。未连接外部数据源时，AI 会列出需要补充的来源，不会伪造行情、政策或新闻。" actions={<button onClick={() => setOpen(true)} disabled={!active?.configured} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018] disabled:cursor-not-allowed disabled:opacity-40"><Sparkles className="h-3.5 w-3.5" />生成 AI 研究</button>} />
    {error && <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-xs text-rose-200">{error}</div>}
    {!active?.configured && <Panel><EmptyStateCard icon={Cpu} title="投研 Agent 尚未连接模型" description="先在 AI 模型中心添加并测试模型。没有模型时，本页面不会展示预置市场数据或虚构研究结论。" action={<Link href="/models" className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">配置 AI 模型</Link>} /></Panel>}
    <div className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
      <Panel><PanelHeader eyebrow="Research briefs" title="AI 研究底稿" description="每一份底稿均由你配置的模型生成，并记录模型标识" />{briefs.length === 0 ? <EmptyStateCard icon={BookOpenCheck} title="还没有研究底稿" description="输入研究主题和范围后，模型会基于当前工作区生成结构化底稿；数据不足时会明确提出待补来源。" /> : <div className="divide-y divide-white/[0.06]">{briefs.map((brief) => <article key={brief.id} className="p-5"><div className="flex flex-wrap items-center gap-2"><span className="rounded-md border border-cyan-400/15 bg-cyan-400/[0.05] px-2 py-1 text-[9px] text-cyan-300">AI 生成 · 待复核</span><span className="text-[9px] text-slate-600">{brief.createdAt}</span><span className="ml-auto font-mono text-[9px] text-slate-700">{brief.model}</span></div><h2 className="mt-3 text-sm font-semibold text-white">{brief.title}</h2><p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-slate-400">{brief.summary}</p></article>)}</div>}</Panel>
      <div className="space-y-4"><Panel><PanelHeader eyebrow="Research context" title="可用内部资料" /><div className="grid grid-cols-2 gap-2 p-4">{[["项目",cases.length],["资料",documents.length],["规则",rules.length],["风险",risks.length]].map(([label,value]) => <div key={String(label)} className="rounded-xl border border-white/[0.07] p-3 text-center"><p className="numeric text-xl text-white">{value}</p><p className="mt-1 text-[9px] text-slate-600">{label}</p></div>)}</div></Panel><Panel><PanelHeader eyebrow="Source policy" title="来源策略" /><div className="space-y-3 p-4">{[[FileSearch,"内部资料","仅使用当前工作区实际存在的资料元数据"],[SearchCheck,"外部来源","未接数据源时只给检索建议，不虚构结果"]].map(([Icon,title,text]) => { const ItemIcon = Icon as typeof FileSearch; return <div key={String(title)} className="rounded-xl border border-white/[0.07] p-3"><ItemIcon className="h-4 w-4 text-cyan-300" /><p className="mt-2 text-xs text-slate-200">{String(title)}</p><p className="mt-1 text-[10px] leading-5 text-slate-600">{String(text)}</p></div>; })}</div></Panel></div>
    </div>
    <EnterpriseDialog open={open} onClose={() => !generating && setOpen(false)} title="生成 AI 专题研究" description="模型只使用当前工作区上下文，不会自动联网搜索">
      <form onSubmit={(event) => void submit(event)} className="space-y-4"><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">研究主题</span><input required name="topic" placeholder="例如：核心客户集中度对经营现金流的影响" className="field-control" /></label><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">研究范围</span><textarea name="scope" rows={3} placeholder="指定行业、政策、企业、风险传导或待验证假设" className="field-control resize-none" /></label><div className="rounded-xl border border-amber-400/10 bg-amber-400/[0.035] p-3 text-[10px] leading-5 text-amber-100/60">如需实时政策、市场或舆情，请后续接入可信外部数据源。当前模型不会把自身记忆冒充实时来源。</div><div className="flex justify-end gap-2"><button type="button" disabled={generating} onClick={() => setOpen(false)} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-400">取消</button><button type="submit" disabled={generating} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018] disabled:opacity-50">{generating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{generating ? "模型生成中" : "生成研究底稿"}</button></div></form>
    </EnterpriseDialog>
  </div>;
}
