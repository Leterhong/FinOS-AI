"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Cpu, FileSpreadsheet, FileText, Loader2, ScanSearch, Upload } from "lucide-react";
import { EmptyStateCard, PageIntro, Panel } from "@/components/enterprise/EnterpriseUI";
import { analyzeEnterpriseDocument } from "@/lib/enterprise-ai";
import { useEnterpriseStore } from "@/store/enterprise-store";
import { useModelStore } from "@/store/model-store";
import type { AnalysisDocument } from "@/types/enterprise";

export default function DocumentsPage() {
  const cases = useEnterpriseStore((state) => state.cases);
  const documents = useEnterpriseStore((state) => state.documents);
  const rules = useEnterpriseStore((state) => state.rules);
  const addDocument = useEnterpriseStore((state) => state.addDocument);
  const completeDocumentAnalysis = useEnterpriseStore((state) => state.completeDocumentAnalysis);
  const failDocumentAnalysis = useEnterpriseStore((state) => state.failDocumentAnalysis);
  const active = useModelStore((state) => state.active);
  const [selected, setSelected] = useState<AnalysisDocument | null>(null);
  const [caseId, setCaseId] = useState("");
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const queryCaseApplied = useRef(false);

  useEffect(() => {
    if (!cases.length) return;
    if (!queryCaseApplied.current) {
      const requested = new URLSearchParams(window.location.search).get("caseId");
      queryCaseApplied.current = true;
      if (requested && cases.some((item) => item.id === requested)) {
        setCaseId(requested);
        return;
      }
    }
    if (!caseId) setCaseId(cases[0].id);
  }, [caseId, cases]);
  useEffect(() => {
    if (selected) {
      const latest = documents.find((item) => item.id === selected.id);
      if (latest) setSelected(latest);
    }
  }, [documents, selected]);

  const canUpload = Boolean(caseId && active?.configured && !uploading);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !caseId || !active?.configured) return;
    const project = cases.find((item) => item.id === caseId);
    const item = addDocument(file, caseId);
    setSelected(item);
    setUploading(true);
    setNotice(`${file.name} 正在由 ${active.displayName || active.modelName} 解析`);
    try {
      const result = await analyzeEnterpriseDocument({ file, project, rules });
      completeDocumentAnalysis(item.id, result.analysis, result.model, result.facts.length, result.ruleHits.filter((hit) => hit.hit).length);
      setNotice(`${file.name} AI 分析完成，等待人工复核`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "资料分析失败";
      failDocumentAnalysis(item.id, message);
      setNotice(`${file.name}：${message}`);
    } finally {
      setUploading(false);
    }
  };

  return <div className="page-shell">
    <PageIntro eyebrow="AI document intelligence" title="企业资料研判" description="上传文件后由当前默认模型读取实际提取文本并生成可复核分析。系统不再展示预置文档、虚假页码、事实或规则命中。" actions={<><input id="enterprise-document-upload" ref={fileRef} type="file" accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md,.json" onChange={(event) => void upload(event)} className="sr-only" aria-label="选择企业资料文件" /><button type="button" onClick={() => fileRef.current?.click()} disabled={!canUpload} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018] disabled:cursor-not-allowed disabled:opacity-40">{uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}{uploading ? "AI 分析中" : "上传并 AI 分析"}</button></>} />
    {notice && <button onClick={() => setNotice("")} className="w-full rounded-xl border border-cyan-400/15 bg-cyan-400/[0.05] px-4 py-3 text-left text-xs text-cyan-200">{notice} · 点击关闭</button>}
    <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
      <label className="block rounded-xl border border-white/[0.08] bg-white/[0.025] p-3"><span className="text-[10px] text-slate-500">关联企业项目</span><select value={caseId} onChange={(event) => setCaseId(event.target.value)} className="mt-2 w-full bg-transparent text-xs text-slate-200 outline-none"><option value="">请选择项目</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.company} · {item.title}</option>)}</select></label>
      <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3"><Cpu className={`h-4 w-4 ${active?.configured ? "text-emerald-300" : "text-amber-300"}`} /><div><p className="text-[10px] text-slate-500">资料分析模型</p><p className="mt-1 text-xs text-slate-200">{active?.configured ? `${active.displayName} · ${active.modelName}` : "尚未配置模型"}</p></div>{!active?.configured && <Link href="/models" className="ml-auto text-[10px] text-cyan-300">去配置</Link>}</div>
    </div>
    {cases.length === 0 ? <Panel><EmptyStateCard icon={FileText} title="先创建企业项目" description="资料必须关联到你创建的真实项目，不会自动挂到任何预置企业。" action={<Link href="/cases" className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">创建项目</Link>} /></Panel> : !active?.configured ? <Panel><EmptyStateCard icon={Cpu} title="连接模型后才能分析资料" description="文件内容不会交给模板生成结果。请先配置大模型，再上传资料触发真实分析。" action={<Link href="/models" className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">配置 AI 模型</Link>} /></Panel> : <div className="grid min-h-[560px] gap-4 xl:grid-cols-[.8fr_1.4fr]">
      <Panel className="flex min-h-0 flex-col"><div className="border-b border-white/[0.07] p-4"><p className="text-xs font-semibold text-slate-200">已上传资料</p><p className="mt-1 text-[10px] text-slate-600">{documents.length} 份 · 文件上限 10MB</p></div>{documents.length === 0 ? <EmptyStateCard icon={Upload} className="flex-1" title="还没有资料" description="支持 PDF、Word、Excel、CSV、TXT、Markdown 和 JSON。扫描 PDF 需要先进行 OCR。" /> : <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2">{documents.map((document) => { const Icon = document.kind === "经营数据" ? FileSpreadsheet : FileText; return <button key={document.id} onClick={() => setSelected(document)} className={`mb-1 w-full rounded-xl border p-3 text-left transition ${selected?.id === document.id ? "border-cyan-400/20 bg-cyan-400/[0.07]" : "border-transparent hover:bg-white/[0.035]"}`}><div className="flex gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.04]"><Icon className="h-4 w-4 text-cyan-300" /></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-slate-200">{document.name}</p><p className="mt-1 text-[10px] text-slate-600">{document.kind} · {document.uploadedAt}</p><p className={`mt-2 text-[10px] ${document.status === "已解析" ? "text-emerald-300" : document.error ? "text-rose-300" : "text-amber-300"}`}>{document.error ? "分析失败" : document.status}</p></div></div></button>; })}</div>}</Panel>
      <Panel className="flex min-h-0 flex-col">{!selected ? <EmptyStateCard icon={ScanSearch} className="flex-1" title="选择一份资料查看 AI 输出" description="分析结果来自实际文件提取文本，并应由业务人员对照原文件复核。" /> : <><div className="border-b border-white/[0.07] px-5 py-4"><p className="truncate text-sm font-semibold text-slate-100">{selected.name}</p><div className="mt-2 flex flex-wrap gap-2 text-[9px] text-slate-600"><span>{selected.kind}</span><span>{selected.status}</span>{selected.model && <span className="font-mono">{selected.model}</span>}</div></div><div className="scrollbar-thin flex-1 overflow-y-auto p-5">{selected.analysis ? <><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.16em] text-cyan-300/70"><ScanSearch className="h-3.5 w-3.5" />AI 资料研判</div><div className="mt-4 grid gap-3 sm:grid-cols-2">{selected.facts > 0 && <div className="rounded-xl border border-white/[0.06] bg-black/10 p-3"><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-cyan-300/70">已抽取事实</p><p className="numeric mt-1 text-lg text-white">{selected.facts}</p><p className="mt-1 text-[10px] text-slate-600">逐条携带原文引用，可在分析正文中对照</p></div>}{selected.ruleHits > 0 && <div className="rounded-xl border border-white/[0.06] bg-black/10 p-3"><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-amber-300/70">确定性规则命中</p><p className="numeric mt-1 text-lg text-white">{selected.ruleHits}</p><p className="mt-1 text-[10px] text-slate-600">由规则引擎对事实判定，可在规则库复核</p></div>}</div><p className="mt-4 whitespace-pre-wrap text-xs leading-7 text-slate-300">{selected.analysis}</p><div className="mt-5 rounded-xl border border-amber-400/10 bg-amber-400/[0.035] p-3 text-[10px] leading-5 text-amber-100/60">模型输出可能存在遗漏或错误。请对照原文件核验所有金额、条款、主体和引用，再进入风险或审批流程。</div></> : selected.error ? <EmptyStateCard title="资料分析失败" description={selected.error} /> : <div className="flex h-full min-h-72 items-center justify-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-cyan-300" />模型正在读取文件提取文本</div>}</div></>}</Panel>
    </div>}
  </div>;
}
