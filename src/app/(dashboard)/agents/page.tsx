"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bot, Braces, CheckCircle2, Clock3, Cpu, FileSearch, GitBranch, Loader2, Play, ShieldCheck, XCircle } from "lucide-react";
import { EmptyStateCard, PageIntro, Panel, PanelHeader } from "@/components/enterprise/EnterpriseUI";
import CaseContextSelector from "@/components/enterprise/CaseContextSelector";
import { useActiveEnterpriseCase } from "@/hooks/use-active-enterprise-case";
import { callEnterpriseAI } from "@/lib/enterprise-ai";
import { useEnterpriseStore } from "@/store/enterprise-store";
import { useModelStore } from "@/store/model-store";

const capabilities = [
  [FileSearch, "资料理解", "读取当前项目关联的资料元数据，识别可用事实与缺口"],
  [Braces, "规则匹配", "把已录入业务规则与可用事实进行可解释匹配"],
  [ShieldCheck, "风险研判", "区分事实、推断与不确定性，形成复核清单"],
  [GitBranch, "流程辅助", "把需要补充和人工核验的事项整理为下一步动作"],
] as const;

export default function AgentsPage() {
  const { cases, activeCase, activeCaseId, setActiveCaseId } = useActiveEnterpriseCase();
  const documents = useEnterpriseStore((state) => state.documents);
  const rules = useEnterpriseStore((state) => state.rules);
  const risks = useEnterpriseStore((state) => state.risks);
  const tasks = useEnterpriseStore((state) => state.tasks);
  const runs = useEnterpriseStore((state) => state.agents);
  const beginAgentRun = useEnterpriseStore((state) => state.beginAgentRun);
  const completeAgentRun = useEnterpriseStore((state) => state.completeAgentRun);
  const failAgentRun = useEnterpriseStore((state) => state.failAgentRun);
  const addRisk = useEnterpriseStore((state) => state.addRisk);
  const addTask = useEnterpriseStore((state) => state.addTask);
  const active = useModelStore((state) => state.active);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");

  const caseDocuments = useMemo(() => documents.filter((item) => item.caseId === activeCaseId), [activeCaseId, documents]);
  const caseRisks = useMemo(() => risks.filter((item) => item.caseId === activeCaseId), [activeCaseId, risks]);
  const canRun = Boolean(active?.configured && activeCase && caseDocuments.length > 0);

  const run = async () => {
    if (!canRun || running) return;
    const startedAt = performance.now();
    const currentRun = beginAgentRun({
      task: `研判 ${activeCase?.company} 的 ${caseDocuments.length} 份资料`,
      model: active?.modelName,
      caseId: activeCase!.id,
      company: activeCase!.company,
    });
    setRunning(true);
    try {
      const result = await callEnterpriseAI({
        mode: "agent",
        question: "请执行一次完整的企业经营与风险研判，列出可用事实、适用规则、风险观察、信息缺口和人工复核清单。",
        context: { cases: [activeCase!], documents: caseDocuments, rules, risks: caseRisks },
      });
      completeAgentRun(currentRun.id, result.answer, `${((performance.now() - startedAt) / 1000).toFixed(1)}s`);
    } catch (error) {
      failAgentRun(currentRun.id, error instanceof Error ? error.message : "模型调用失败", `${((performance.now() - startedAt) / 1000).toFixed(1)}s`);
    } finally {
      setRunning(false);
    }
  };

  /** 把 Agent 研判输出一键转为待核验风险信号（需人工补全等级与规则依据）。 */
  const promoteToRisk = (run: (typeof runs)[number]) => {
    const relatedCase = cases.find((item) => item.id === run.caseId);
    if (!relatedCase) {
      setNotice(`运行 ${run.id} 未记录项目归属，请在当前项目重新运行后再登记风险`);
      return;
    }
    const title = `Agent 研判发现：${run.task}`.slice(0, 80);
    const existing = risks.find((risk) => risk.caseId === relatedCase.id && risk.title === title);
    if (existing) {
      setNotice(`运行 ${run.id} 已登记为风险 ${existing.id}，不会重复创建`);
      return;
    }
    const risk = addRisk({
      caseId: relatedCase.id,
      company: relatedCase.company,
      title,
      level: "medium",
      evidence: (run.output || "").slice(0, 500),
      rule: "待人工补充命中规则",
      impact: "待人工核验后补充",
    });
    setNotice(`已将运行 ${run.id} 的输出登记为待核验风险 ${risk.id}，请在风险中心补全并核验`);
  };

  /** 把 Agent 研判输出转为流程中心的补充/核验任务。 */
  const promoteToTask = (run: (typeof runs)[number]) => {
    const relatedCase = cases.find((item) => item.id === run.caseId);
    if (!relatedCase) {
      setNotice(`运行 ${run.id} 未记录项目归属，请在当前项目重新运行后再创建流程任务`);
      return;
    }
    const title = `人工核验 Agent 研判：${run.task}`.slice(0, 80);
    const caseName = `${relatedCase.company} · ${relatedCase.title}`;
    if (tasks.some((task) => task.title === title && (task.caseId === relatedCase.id || task.caseName === caseName))) {
      setNotice(`运行 ${run.id} 已创建过流程任务，不会重复创建`);
      return;
    }
    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    addTask({
      title,
      caseId: relatedCase.id,
      caseName,
      assignee: relatedCase.owner || "待指派",
      due: dueDate,
      priority: "medium",
    });
    setNotice(`已基于运行 ${run.id} 创建流程任务，请在流程中心推进`);
  };

  const missing = [
    !active?.configured && "AI 模型",
    !activeCase && "企业项目",
    activeCase && caseDocuments.length === 0 && "当前项目资料",
  ].filter(Boolean) as string[];

  return <div className="page-shell">
    <PageIntro eyebrow="AI agent orchestration" title="企业金融 Agent 中心" description="由当前默认大模型执行真实研判调用。系统不会用计时器模拟运行，也不会在没有项目或资料时生成伪造结果。" actions={<button onClick={() => void run()} disabled={!canRun || running} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018] disabled:cursor-not-allowed disabled:opacity-40">{running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}{running ? "模型研判中…" : "运行研判 Agent"}</button>} />

    <CaseContextSelector cases={cases} value={activeCaseId} onChange={setActiveCaseId} detail={`${caseDocuments.length} 份资料 · ${caseRisks.length} 个既有风险，仅当前项目会进入模型`} />

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{capabilities.map(([Icon, title, text]) => <Panel key={title} className="p-4"><div className="grid h-10 w-10 place-items-center rounded-xl border border-cyan-400/15 bg-cyan-400/[0.07]"><Icon className="h-5 w-5 text-cyan-300" /></div><h2 className="mt-4 text-sm font-semibold text-slate-100">{title} Agent</h2><p className="mt-2 text-[11px] leading-5 text-slate-500">{text}</p></Panel>)}</div>

    {!canRun && <Panel><EmptyStateCard icon={active?.configured ? FileSearch : Cpu} title="研判链路尚未就绪" description={`还需要：${missing.join("、")}。配置完成后，运行按钮会发起真实模型请求并保存输出。`} action={<div className="flex flex-wrap justify-center gap-2">{!active?.configured && <Link href="/models" className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">配置模型</Link>}{!activeCase && <Link href="/cases" className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-300">创建项目</Link>}{activeCase && caseDocuments.length === 0 && <Link href={`/documents?caseId=${encodeURIComponent(activeCase.id)}`} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-300">上传当前项目资料</Link>}</div>} /></Panel>}

    <div className="grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
      <Panel><PanelHeader eyebrow="Execution history" title="真实运行记录" description="记录项目归属、模型、耗时、状态和完整输出" />{runs.length === 0 ? <EmptyStateCard icon={Bot} title="尚无 Agent 运行" description="满足项目、资料和模型三个前置条件后，可发起第一次研判。" /> : <div className="divide-y divide-white/[0.06]">{notice && <p className="mx-5 mt-4 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.05] px-3 py-2 text-[11px] text-cyan-200">{notice}</p>}{runs.map((item) => <article key={item.id} className="p-5"><div className="flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] ${item.status === "已完成" ? "border-emerald-400/15 text-emerald-300" : item.status === "失败" ? "border-rose-400/15 text-rose-300" : "border-cyan-400/15 text-cyan-300"}`}>{item.status === "已完成" ? <CheckCircle2 className="h-3 w-3" /> : item.status === "失败" ? <XCircle className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}{item.status}</span><span className="font-mono text-[9px] text-slate-700">{item.id}</span><span className="rounded-md border border-white/[0.07] px-2 py-1 text-[9px] text-slate-500">{item.company || "历史记录未标注项目"}</span><span className="ml-auto text-[10px] text-slate-600">{item.model || "未记录模型"} · {item.duration}</span></div><h3 className="mt-3 text-sm font-medium text-slate-100">{item.task}</h3><p className={`mt-3 whitespace-pre-wrap text-xs leading-6 ${item.error ? "text-rose-200/80" : "text-slate-400"}`}>{item.output || item.error || "模型正在处理…"}</p>{item.status === "已完成" && <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => promoteToRisk(item)} className="rounded-lg border border-white/10 px-3 py-1.5 text-[10px] text-slate-300 transition hover:border-rose-400/25 hover:text-rose-200">登记为风险信号</button><button onClick={() => promoteToTask(item)} className="rounded-lg border border-white/10 px-3 py-1.5 text-[10px] text-slate-300 transition hover:border-cyan-400/25 hover:text-cyan-200">转为流程任务</button></div>}</article>)}</div>}</Panel>
      <div className="space-y-4"><Panel><PanelHeader eyebrow="Runtime context" title="本次可用上下文" /><div className="grid grid-cols-2 gap-2 p-4">{[["当前项目",activeCase ? 1 : 0],["项目资料",caseDocuments.length],["全局规则",rules.length],["项目风险",caseRisks.length]].map(([label,value]) => <div key={String(label)} className="rounded-xl border border-white/[0.07] p-3 text-center"><p className="numeric text-xl text-white">{value}</p><p className="mt-1 text-[9px] text-slate-600">{label}</p></div>)}</div></Panel><Panel><PanelHeader eyebrow="Governance" title="执行边界" /><ul className="space-y-2 p-4 text-[10px] leading-5 text-slate-600"><li>· 仅读取当前企业项目的业务数据</li><li>· 不编造未提供的证据和外部来源</li><li>· 不执行审批、付款或对外发送</li><li>· 输出必须经过授权人员复核</li></ul></Panel></div>
    </div>
  </div>;
}
