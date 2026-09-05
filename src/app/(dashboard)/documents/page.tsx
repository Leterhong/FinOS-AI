"use client";

import { ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { formatWhen } from "@/lib/relative-time";
import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCopy, Cpu, FileSpreadsheet, FileText, Loader2, RefreshCcw, ScanSearch, ShieldAlert, Trash2, Upload } from "lucide-react";
import { EmptyStateCard, PageIntro, Panel } from "@/components/enterprise/EnterpriseUI";
import CaseContextSelector from "@/components/enterprise/CaseContextSelector";
import EnterpriseDialog from "@/components/enterprise/EnterpriseDialog";
import { useActiveEnterpriseCase } from "@/hooks/use-active-enterprise-case";
import { analyzeEnterpriseDocument } from "@/lib/enterprise-ai";
import { AIProcessingState } from "@/components/intelligence/AIProcessingState";
import { useEnterpriseStore } from "@/store/enterprise-store";
import { useModelStore } from "@/store/model-store";
import type { AnalysisDocument, EvidenceFact } from "@/types/enterprise";

function FactLedger({ facts, onReview, onPromote, onLocate }: { facts: EvidenceFact[]; onReview: (fact: EvidenceFact) => void; onPromote: (fact: EvidenceFact) => void; onLocate: (fact: EvidenceFact) => void }) {
  if (!facts.length) return null;
  return <section className="mt-5"><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-slate-600">结构化事实与原文引用</p><div className="mt-2 space-y-2">{facts.map((fact) => <article key={fact.id} className="rounded-xl border border-white/[0.07] p-3"><div className="flex flex-wrap items-center gap-2"><span className="text-xs text-slate-200">{fact.topic}</span><span className="numeric text-xs text-cyan-200">{fact.value}{fact.unit}</span><span className={`ml-auto text-[9px] ${fact.reviewStatus === "已确认" ? "text-emerald-300" : fact.reviewStatus === "已驳回" ? "text-rose-300" : "text-amber-300"}`}>{fact.reviewStatus}</span></div><p className="mt-2 text-[10px] leading-5 text-slate-500">“{fact.quote}”</p><div className="mt-2 flex items-center justify-between gap-3"><p className="text-[9px] text-slate-700">{fact.location || "位置未提供"}{fact.coordinate?.page ? ` · 第 ${fact.coordinate.page} 页` : ""}{fact.coordinate?.line ? ` · 第 ${fact.coordinate.line} 行` : ""}{fact.coordinate?.cell ? ` · ${fact.coordinate.sheet || "表格"}!${fact.coordinate.cell}` : ""}{fact.coordinate?.bbox ? ` · 坐标 ${fact.coordinate.bbox.map((value) => value.toFixed(3)).join(",")}` : ""}{fact.period ? ` · ${fact.period}` : ""}</p><div className="flex shrink-0 gap-1.5"><button type="button" onClick={() => onLocate(fact)} className="rounded-lg border border-cyan-400/15 px-2.5 py-1 text-[9px] text-cyan-200/80 hover:border-cyan-400/30">定位原文</button><button type="button" onClick={() => onPromote(fact)} className="rounded-lg border border-rose-400/15 px-2.5 py-1 text-[9px] text-rose-200/80 hover:border-rose-400/30 hover:text-rose-200">转候选风险</button><button type="button" onClick={() => onReview(fact)} className="rounded-lg border border-white/10 px-2.5 py-1 text-[9px] text-slate-400 hover:border-cyan-400/20 hover:text-cyan-200">人工复核</button></div></div></article>)}</div></section>;
}

/** Evidence 高亮：把聚焦事实的原文引用在研判文本中标记出来（Evidence Chain UI）。 */
function highlightEvidence(text: string, facts: EvidenceFact[], focusedId: string | null): ReactNode[] {
  const fact = facts.find((item) => item.id === focusedId);
  if (!fact || !fact.quote || !text.includes(fact.quote)) return [text];
  const index = text.indexOf(fact.quote);
  return [
    text.slice(0, index),
    <mark key={fact.id} id={`evidence-${fact.id}`} className="rounded bg-wealth/20 px-0.5 text-cyan-100 ring-1 ring-wealth/40">{fact.quote}</mark>,
    text.slice(index + fact.quote.length),
  ];
}

function TableLedger({ document, focusedFact }: { document: AnalysisDocument; focusedFact?: EvidenceFact | null }) {
  if (!document.tables?.length) return null;
  return <Panel><div className="border-b border-white/[0.07] px-5 py-4"><p className="text-sm font-semibold text-slate-100">表格结构识别</p><p className="mt-1 text-[10px] text-slate-600">{document.name} · {document.tables.length} 张表 · {document.extractionMethod || "结构化抽取"}</p></div><div className="scrollbar-thin overflow-x-auto p-5"><div className="grid gap-4">{document.tables.map((table, tableIndex) => <section key={`${table.name}-${tableIndex}`} className="min-w-[520px] overflow-hidden rounded-xl border border-white/[0.07]"><div className="flex items-center justify-between bg-white/[0.035] px-3 py-2"><p className="text-xs font-medium text-slate-200">{table.name || `表格 ${tableIndex + 1}`}</p><span className="text-[9px] text-slate-600">{table.sheet ? `${table.sheet} · ` : ""}{table.range ? `${table.range} · ` : ""}{table.rows.length} 行</span></div><table className="w-full border-collapse text-left text-[10px]"><thead><tr>{table.headers.map((header, index) => <th key={`${header}-${index}`} className="border-b border-r border-white/[0.06] px-3 py-2 font-medium text-cyan-200/80 last:border-r-0">{header}</th>)}</tr></thead><tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex} className="odd:bg-black/10">{table.headers.map((header, columnIndex) => { const cellValue = String(row[header] ?? "—"); const isEvidence = focusedFact ? cellValue.includes(focusedFact.quote) || focusedFact.quote.includes(cellValue) && cellValue !== "—" : false; return <td key={columnIndex} className={`border-r border-white/[0.05] px-3 py-2 last:border-r-0 ${isEvidence ? "bg-wealth/15 text-cyan-100 ring-1 ring-inset ring-wealth/40" : "text-slate-400"}`}>{cellValue}</td>; })}</tr>)}</tbody></table></section>)}</div></div></Panel>;
}

export default function DocumentsPage() {
  const { cases, activeCase, activeCaseId: caseId, setActiveCaseId: setCaseId } = useActiveEnterpriseCase();
  const documents = useEnterpriseStore((state) => state.documents);
  const rules = useEnterpriseStore((state) => state.rules);
  const addDocument = useEnterpriseStore((state) => state.addDocument);
  const completeDocumentAnalysis = useEnterpriseStore((state) => state.completeDocumentAnalysis);
  const failDocumentAnalysis = useEnterpriseStore((state) => state.failDocumentAnalysis);
  const reviewFact = useEnterpriseStore((state) => state.reviewFact);
  const deleteDocument = useEnterpriseStore((state) => state.deleteDocument);
  const rerunRulesForDocument = useEnterpriseStore((state) => state.rerunRulesForDocument);
  const addRisk = useEnterpriseStore((state) => state.addRisk);
  const [elapsed, setElapsed] = useState(0);
  const [stageState, setStageState] = useState<Record<string, "active" | "done">>({});
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");
  const [focusedFactId, setFocusedFactId] = useState<string | null>(null);
  const active = useModelStore((state) => state.active);
  const [selected, setSelected] = useState<AnalysisDocument | null>(null);
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState(false);
  const [failedUploads, setFailedUploads] = useState<Array<{ documentId: string; caseId: string; file: File }>>([]);
  const [reviewingFact, setReviewingFact] = useState<EvidenceFact | null>(null);
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
  }, [caseId, cases, setCaseId]);
  useEffect(() => {
    if (selected) {
      const latest = documents.find((item) => item.id === selected.id);
      if (latest) setSelected(latest);
    }
  }, [documents, selected]);
  useEffect(() => {
    if (selected && selected.caseId !== caseId) setSelected(null);
  }, [caseId, selected]);

  const projectDocuments = useMemo(
    () => documents.filter((document) => document.caseId === caseId),
    [caseId, documents],
  );

  const canUpload = Boolean(caseId && active?.configured && !uploading);

  // 研判等待计时：两段式（抽取+叙述）通常 30-120 秒，给用户明确的预期。
  useEffect(() => {
    if (!uploading) {
      setElapsed(0);
      setStageState({});
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [uploading]);

  const locateFact = (fact: EvidenceFact) => {
    setFocusedFactId(fact.id);
    requestAnimationFrame(() => {
      document.getElementById(`evidence-${fact.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const focusedFact = useMemo(
    () => (focusedFactId ? documents.flatMap((d) => d.factItems ?? []).find((f) => f.id === focusedFactId) ?? null : null),
    [documents, focusedFactId],
  );

  const promoteFactToRisk = (fact: EvidenceFact) => {
    if (!fact.caseId) return;
    const company = cases.find((item) => item.id === fact.caseId)?.company ?? "";
    const risk = addRisk({
      caseId: fact.caseId,
      company,
      title: `事实关注：${fact.topic} ${fact.value}${fact.unit}`.slice(0, 80),
      level: "medium",
      evidence: `「${fact.quote}」（${fact.documentName}）`,
      rule: "待人工补充命中规则",
      impact: "待人工核验后补充",
      origin: "事实台账",
      factIds: [fact.id],
    });
    setNotice(`已将事实「${fact.topic}」登记为待核验风险 ${risk.id}`);
  };

  const rerunRules = (document: AnalysisDocument) => {
    const outcome = rerunRulesForDocument(document.id);
    if (!outcome) return;
    setNotice(outcome.total
      ? `已用当前规则库对「${document.name}」重跑规则：${outcome.total} 条中命中 ${outcome.hits} 条`
      : "规则库中暂无带触发条件的规则；请在规则页为规则补充「指标+阈值」条件后重试");
  };

  const copyAnalysis = (document: AnalysisDocument) => {
    const parts = [document.analysis];
    for (const outcome of document.ruleOutcomes ?? []) {
      parts.push(`- ${outcome.code} ${outcome.name}：${outcome.hit ? "命中" : "未命中"}（${outcome.reason}）`);
    }
    const text = parts.filter(Boolean).join("\n\n");
    if (!text) return;
    void navigator.clipboard?.writeText(text).then(() => setNotice("已复制研判结果为 Markdown 文本"));
  };

  const removeDocument = (document: AnalysisDocument) => {
    if (!window.confirm(`确定删除资料「${document.name}」？将同时从云端移除。`)) return;
    deleteDocument(document.id);
    if (selected?.id === document.id) setSelected(null);
    setNotice(`已删除资料「${document.name}」`);
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length || !caseId || !active?.configured) return;
    const project = activeCase;
    setUploading(true);
    let succeeded = 0;
    const failures: string[] = [];
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        failures.push(`${file.name} 超过 10MB`);
        continue;
      }
      const item = addDocument(file, caseId);
      setSelected(item);
      setNotice(`正在分析 ${succeeded + failures.length + 1}/${files.length}：${file.name}`);
      try {
        const result = await analyzeEnterpriseDocument({ file, project, rules, onStage: (stage, state) => setStageState((current) => ({ ...current, [stage]: state })) });
        completeDocumentAnalysis(item.id, result.analysis, result.model, {
          facts: result.facts,
          ruleOutcomes: result.ruleHits,
          uncertainties: result.uncertainties,
          extractionMethod: result.extractionMethod,
          ocrUsed: result.ocrUsed,
          tables: result.tables,
        });
        setFailedUploads((current) => current.filter((failed) => failed.documentId !== item.id));
        succeeded += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "资料分析失败";
        failDocumentAnalysis(item.id, message);
        setFailedUploads((current) => [...current.filter((failed) => failed.documentId !== item.id), { documentId: item.id, caseId, file }]);
        failures.push(`${file.name}：${message}`);
      }
    }
    setUploading(false);
    setNotice(`批量处理完成：${succeeded} 成功${failures.length ? `，${failures.length} 个失败：${failures.join("；")}` : "，全部等待人工复核"}`);
  };

  const retryFailed = async () => {
    const queue = failedUploads.filter((item) => item.caseId === caseId);
    const project = cases.find((item) => item.id === caseId);
    if (!queue.length || !project || !active?.configured) return;
    setUploading(true);
    setFailedUploads((current) => current.filter((item) => item.caseId !== caseId));
    let succeeded = 0;
    const failures: string[] = [];
    for (const [index, item] of queue.entries()) {
      setSelected(documents.find((document) => document.id === item.documentId) ?? null);
      setNotice(`正在重试 ${index + 1}/${queue.length}：${item.file.name}`);
      try {
        const result = await analyzeEnterpriseDocument({ file: item.file, project, rules, onStage: (stage, state) => setStageState((current) => ({ ...current, [stage]: state })) });
        completeDocumentAnalysis(item.documentId, result.analysis, result.model, {
          facts: result.facts,
          ruleOutcomes: result.ruleHits,
          uncertainties: result.uncertainties,
          extractionMethod: result.extractionMethod,
          ocrUsed: result.ocrUsed,
          tables: result.tables,
        });
        succeeded += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "资料分析失败";
        failDocumentAnalysis(item.documentId, message);
        setFailedUploads((current) => [...current, item]);
        failures.push(`${item.file.name}：${message}`);
      }
    }
    setUploading(false);
    setNotice(`重试完成：${succeeded} 成功，${failures.length} 仍失败${failures.length ? `；${failures.join("；")}` : ""}`);
  };

  const submitReview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !reviewingFact) return;
    const data = new FormData(event.currentTarget);
    reviewFact(selected.id, reviewingFact.id, {
      status: String(data.get("status")) as EvidenceFact["reviewStatus"],
      reviewer: String(data.get("reviewer")),
      note: String(data.get("note") || ""),
    });
    setReviewingFact(null);
  };

  return <div className="page-shell">
    <PageIntro eyebrow="AI document intelligence" title="企业资料研判" description="支持文本解析、图片 OCR、表格结构识别和真实行号/图像坐标，所有事实进入人工复核。单文件上限 10MB。" actions={<><input id="enterprise-document-upload" ref={fileRef} type="file" multiple accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md,.json,.png,.jpg,.jpeg,.webp" onChange={(event) => void upload(event)} className="sr-only" aria-label="选择一份或多份企业资料文件" /><button type="button" onClick={() => fileRef.current?.click()} disabled={!canUpload} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018] disabled:cursor-not-allowed disabled:opacity-40">{uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}{uploading ? "批量分析中" : "批量上传并分析"}</button></>} />
    {notice && <div className="flex flex-col gap-2 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.05] px-4 py-3 text-xs text-cyan-200 sm:flex-row sm:items-center"><p className="min-w-0 flex-1">{notice}</p>{failedUploads.some((item) => item.caseId === caseId) && <button type="button" onClick={() => void retryFailed()} disabled={uploading || !active?.configured} className="rounded-lg border border-cyan-300/20 px-3 py-1.5 text-[10px] disabled:opacity-40">重试当前项目失败项</button>}<button type="button" onClick={() => setNotice("")} className="text-[10px] text-slate-500 hover:text-slate-300">关闭</button></div>}
    <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
      <CaseContextSelector cases={cases} value={caseId} onChange={setCaseId} detail={`${projectDocuments.length} 份关联资料，仅本项目内容会进入分析`} />
      <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3"><Cpu className={`h-4 w-4 ${active?.configured ? "text-emerald-300" : "text-amber-300"}`} /><div><p className="text-[10px] text-slate-500">资料分析模型</p><p className="mt-1 text-xs text-slate-200">{active?.configured ? `${active.displayName} · ${active.modelName}` : "尚未配置模型"}</p></div>{!active?.configured && <Link href="/models" className="ml-auto text-[10px] text-cyan-300">去配置</Link>}</div>
    </div>
    {cases.length === 0 ? <Panel><EmptyStateCard icon={FileText} title="先创建企业项目" description="资料必须关联到你创建的真实项目，不会自动挂到任何预置企业。" action={<Link href="/cases" className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">创建项目</Link>} /></Panel> : <>{!active?.configured && <Panel><EmptyStateCard icon={Cpu} title="连接模型后才能分析新资料" description="既有资料和历史分析仍可查看；如需上传并触发真实分析，请先配置大模型。" action={<Link href="/models" className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">配置 AI 模型</Link>} /></Panel>}{projectDocuments.length > 0 && <div className="my-3 grid grid-cols-2 gap-2 xl:hidden">
      {([["list", `资料列表（${projectDocuments.length}）`], ["detail", "AI 研判详情"]] as const).map(([value, label]) => (
        <button key={value} type="button" onClick={() => setMobileView(value)} className={`rounded-xl border px-3 py-2 text-xs transition ${mobileView === value ? "border-cyan-400/30 bg-cyan-400/[0.08] text-cyan-100" : "border-white/[0.08] bg-white/[0.02] text-slate-500"}`}>{label}</button>
      ))}
    </div>}<div className={mobileView === "detail" ? "hidden min-h-[560px] gap-4 xl:grid xl:grid-cols-[.8fr_1.4fr]" : "grid min-h-[560px] gap-4 xl:grid-cols-[.8fr_1.4fr]"}>
      <Panel className={`flex min-h-0 flex-col ${mobileView === "detail" ? "hidden xl:flex" : ""}`}><div className="border-b border-white/[0.07] p-4"><p className="text-xs font-semibold text-slate-200">当前项目资料</p><p className="mt-1 text-[10px] text-slate-600">{projectDocuments.length} 份 · 文件上限 10MB</p></div>{projectDocuments.length === 0 ? <EmptyStateCard icon={Upload} className="flex-1" title="当前项目还没有资料" description="支持 PDF、Word、Excel、CSV、文本和 PNG/JPEG/WebP 图片 OCR。扫描 PDF 可逐页转为图片上传。" /> : <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2">{projectDocuments.map((document) => { const Icon = document.kind === "经营数据" ? FileSpreadsheet : FileText; return <button key={document.id} onClick={() => setSelected(document)} className={`mb-1 w-full rounded-xl border p-3 text-left transition ${selected?.id === document.id ? "border-cyan-400/20 bg-cyan-400/[0.07]" : "border-transparent hover:bg-white/[0.035]"}`}><div className="flex gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.04]"><Icon className="h-4 w-4 text-cyan-300" /></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-slate-200">{document.name}</p><p className="mt-1 text-[10px] text-slate-600">{document.kind} · {formatWhen(document.uploadedAt)}{document.ocrUsed ? " · OCR" : ""}</p><p className={`mt-2 text-[10px] ${document.status === "已解析" ? "text-emerald-300" : document.status === "分析失败" ? "text-rose-300" : document.error ? "text-rose-300" : "text-amber-300"}`}>{document.status === "分析失败" || document.error ? "分析失败" : document.status}</p></div></div></button>; })}</div>}</Panel>
      <Panel className={`flex min-h-0 flex-col ${mobileView === "list" ? "hidden xl:flex" : ""}`}>{!selected ? <EmptyStateCard icon={ScanSearch} className="flex-1" title="选择一份资料查看 AI 输出" description="分析结果来自实际文件提取文本，并应由业务人员对照原文件复核。" /> : <><div className="border-b border-white/[0.07] px-5 py-4"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold text-slate-100">{selected.name}</p><div className="flex shrink-0 gap-1.5">{selected.status === "已解析" && <button type="button" onClick={() => rerunRules(selected)} title="用当前规则库重跑规则评估" className="rounded-lg border border-white/10 p-1.5 text-slate-500 hover:border-cyan-400/25 hover:text-cyan-200"><RefreshCcw className="h-3.5 w-3.5" /></button>}<button type="button" onClick={() => copyAnalysis(selected)} title="复制为 Markdown" className="rounded-lg border border-white/10 p-1.5 text-slate-500 hover:border-cyan-400/25 hover:text-cyan-200"><ClipboardCopy className="h-3.5 w-3.5" /></button><button type="button" onClick={() => removeDocument(selected)} title="删除该资料" className="rounded-lg border border-white/10 p-1.5 text-slate-500 hover:border-rose-400/30 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button></div></div><div className="mt-2 flex flex-wrap gap-2 text-[9px] text-slate-600"><span>{selected.kind}</span><span>{selected.status}</span>{selected.model && <span className="font-mono">{selected.model}</span>}</div></div><div className="scrollbar-thin flex-1 overflow-y-auto p-5">{selected.analysis ? <><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.16em] text-cyan-300/70"><ScanSearch className="h-3.5 w-3.5" />AI 资料研判</div><div className="mt-4 grid gap-3 sm:grid-cols-2">{selected.facts > 0 && <div className="rounded-xl border border-white/[0.06] bg-black/10 p-3"><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-cyan-300/70">已抽取事实</p><p className="numeric mt-1 text-lg text-white">{selected.facts}</p><p className="mt-1 text-[10px] text-slate-600">逐条携带原文引用，可在下方逐项复核</p></div>}{selected.ruleHits > 0 && <div className="rounded-xl border border-white/[0.06] bg-black/10 p-3"><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-amber-300/70">确定性规则命中</p><p className="numeric mt-1 text-lg text-white">{selected.ruleHits}</p><p className="mt-1 text-[10px] text-slate-600">由规则引擎对事实判定，可在规则库复核</p></div>}</div><FactLedger facts={selected.factItems ?? []} onReview={setReviewingFact} onPromote={promoteFactToRisk} onLocate={locateFact} />{(selected.ruleOutcomes ?? []).length > 0 && <section className="mt-5"><p className="text-[10px] font-semibold uppercase tracking-[.15em] text-slate-600">规则执行结果</p><div className="mt-2 space-y-2">{selected.ruleOutcomes?.map((outcome) => <div key={outcome.code} className="rounded-xl border border-white/[0.07] p-3"><p className={`text-xs ${outcome.hit ? "text-amber-200" : "text-slate-400"}`}>{outcome.code} · {outcome.name} · {outcome.hit ? "命中" : "未命中"}</p><p className="mt-1 text-[10px] leading-5 text-slate-600">{outcome.reason}</p></div>)}</div></section>}<p className="mt-5 whitespace-pre-wrap text-xs leading-7 text-slate-300">{highlightEvidence(selected.analysis ?? "", selected.factItems ?? [], focusedFactId)}</p><div className="mt-5 rounded-xl border border-amber-400/10 bg-amber-400/[0.035] p-3 text-[10px] leading-5 text-amber-100/60">模型输出可能存在遗漏或错误。请对照原文件核验所有金额、条款、主体和引用，再进入风险或审批流程。</div></> : selected.error || selected.status === "分析失败" ? <EmptyStateCard icon={AlertTriangle} title="资料分析失败" description={selected.error || "分析在会话结束前未完成"} action={<button type="button" onClick={() => removeDocument(selected)} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">删除后重新上传</button>} /> : <div className="flex h-full min-h-72 flex-col justify-center gap-3 px-6 text-xs text-slate-500">
        <AIProcessingState
          mode="detailed"
          title={`模型正在研判「${selected.name}」`}
          elapsedSeconds={elapsed}
          stages={[
            { id: "parse", label: "解析文件结构与文本", state: (stageState.parse ?? "pending") as "pending" | "active" | "done" },
            { id: "facts", label: "抽取结构化事实（模型调用）", state: (stageState.facts ?? "pending") as "pending" | "active" | "done" },
            { id: "rules", label: "规则引擎确定性判定", state: (stageState.rules ?? "pending") as "pending" | "active" | "done" },
            { id: "narrative", label: "生成研判叙述（模型调用）", state: (stageState.narrative ?? "pending") as "pending" | "active" | "done" },
          ]}
        />
      </div>}</div></>}</Panel>
    </div>{(selected ?? projectDocuments[0]) && <TableLedger document={(selected ?? projectDocuments[0])!} focusedFact={focusedFact} />}</>}
    <EnterpriseDialog open={Boolean(reviewingFact)} onClose={() => setReviewingFact(null)} title="复核结构化事实" description={reviewingFact ? `${reviewingFact.topic} · ${reviewingFact.value}${reviewingFact.unit}` : undefined}><form onSubmit={submitReview} className="space-y-4"><div className="rounded-xl border border-white/[0.07] p-3 text-[11px] leading-6 text-slate-400">原文：{reviewingFact?.quote}<br />位置：{reviewingFact?.location || "模型未提供，请对照原文件查找"}</div><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">复核结论</span><select name="status" defaultValue="已确认" className="field-control"><option>已确认</option><option>已驳回</option><option>待复核</option></select></label><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">复核人</span><input required name="reviewer" placeholder="填写真实复核人" className="field-control" /></label><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">复核意见</span><textarea name="note" rows={3} placeholder="说明核对结果、修正依据或驳回原因" className="field-control resize-none" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setReviewingFact(null)} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-400">取消</button><button type="submit" className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">保存复核</button></div></form></EnterpriseDialog>
  </div>;
}
