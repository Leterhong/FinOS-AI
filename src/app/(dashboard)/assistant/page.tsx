"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bot, CornerDownLeft, Cpu, DatabaseZap, Loader2, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { EmptyStateCard, PageIntro, Panel } from "@/components/enterprise/EnterpriseUI";
import CaseContextSelector from "@/components/enterprise/CaseContextSelector";
import { useActiveEnterpriseCase } from "@/hooks/use-active-enterprise-case";
import { streamEnterpriseAI } from "@/lib/enterprise-ai";
import { useEnterpriseStore } from "@/store/enterprise-store";
import { useModelStore } from "@/store/model-store";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  error?: boolean;
}

const promptStarters = [
  "根据当前工作区，列出已知事实、数据缺口和下一步核验动作",
  "检查现有资料能否支持企业经营风险判断",
  "结合现有规则，给出需要人工复核的事项",
];

export default function AssistantPage() {
  const { cases, activeCase, activeCaseId, setActiveCaseId } = useActiveEnterpriseCase();
  const documents = useEnterpriseStore((state) => state.documents);
  const rules = useEnterpriseStore((state) => state.rules);
  const risks = useEnterpriseStore((state) => state.risks);
  const assistantMessages = useEnterpriseStore((state) => state.assistantMessages);
  const appendAssistantMessage = useEnterpriseStore((state) => state.appendAssistantMessage);
  const clearAssistantHistory = useEnterpriseStore((state) => state.clearAssistantHistory);
  const active = useModelStore((state) => state.active);
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);
  // 流式进行中的临时气泡：完成后才落入持久化 store（避免每个 token 触发持久化）。
  const [streamText, setStreamText] = useState("");
  const streamTextRef = useRef("");

  const caseDocuments = useMemo(() => documents.filter((item) => item.caseId === activeCaseId), [activeCaseId, documents]);
  const caseRisks = useMemo(() => risks.filter((item) => item.caseId === activeCaseId), [activeCaseId, risks]);

  // 对话历史持久化在工作区 store：刷新/关闭浏览器后仍可回溯 AI 研判记录。
  const messages: Message[] = assistantMessages.filter((message) =>
    message.caseId === activeCaseId || (!message.caseId && cases.length === 1),
  ).map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    model: m.model,
    error: m.error,
  }));

  const submit = async () => {
    const question = query.trim();
    if (!question || sending || !active?.configured || !activeCase) return;
    appendAssistantMessage({ role: "user", content: question, caseId: activeCase.id });
    setQuery("");
    setSending(true);
    setStreamText("");
    streamTextRef.current = "";
    try {
      const result = await streamEnterpriseAI(
        {
          question,
          mode: "chat",
          context: { cases: [activeCase], documents: caseDocuments, rules, risks: caseRisks },
        },
        (delta) => {
          streamTextRef.current += delta;
          setStreamText(streamTextRef.current);
        }
      );
      appendAssistantMessage({
        role: "assistant",
        content: result.answer,
        model: result.model,
        caseId: activeCase.id,
      });
    } catch (error) {
      // 流式中途失败：把已生成的部分保留为错误消息，不静默丢弃。
      const partial = streamTextRef.current ? `（流式中断，已生成部分如下）

${streamTextRef.current}` : undefined;
      appendAssistantMessage({
        role: "assistant",
        content: partial ?? (error instanceof Error ? error.message : "AI 调用失败，请检查模型连接。"),
        error: !partial,
        caseId: activeCase.id,
      });
    } finally {
      setSending(false);
      setStreamText("");
      streamTextRef.current = "";
    }
  };

  return <div className="page-shell">
    <PageIntro eyebrow="AI financial reasoning" title="智能研判助手" description="由你配置的真实大模型驱动。每段对话仅接收当前企业项目的资料、规则和风险上下文，不跨项目混用信息。" actions={<Link href="/models" className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-300"><Cpu className="h-3.5 w-3.5 text-cyan-300" />{active?.configured ? active.displayName : "配置 AI 模型"}</Link>} />
    <CaseContextSelector cases={cases} value={activeCaseId} onChange={setActiveCaseId} detail={`${caseDocuments.length} 份资料 · ${caseRisks.length} 个风险，对话记录按项目隔离`} />
    <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
      <Panel className="flex min-h-[650px] flex-col">
        {!activeCase ? <EmptyStateCard icon={DatabaseZap} className="flex-1" title="先选择一个企业项目" description="研判对话必须绑定明确企业，避免不同客户或项目的数据进入同一次模型请求。" action={<Link href="/cases" className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">创建企业项目</Link>} /> : !active?.configured ? <EmptyStateCard icon={Cpu} className="flex-1" title="先连接一个 AI 大模型" description="助手不会使用本地模板或伪造回复。请在模型中心填写 Provider、Base URL、Model ID 和 API Key，并完成连接测试。" action={<Link href="/models" className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">前往 AI 模型中心</Link>} /> : <>
          <div className="scrollbar-thin flex-1 overflow-y-auto p-4 sm:p-6">
            {messages.length === 0 ? <div className="flex h-full min-h-80 flex-col items-center justify-center text-center"><div className="grid h-14 w-14 place-items-center rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.06]"><Sparkles className="h-6 w-6 text-cyan-300" /></div><h2 className="mt-4 text-base font-semibold text-white">研判 {activeCase.company}</h2><p className="mt-2 max-w-lg text-xs leading-6 text-slate-500">当前上下文限定为 1 个项目、{caseDocuments.length} 份资料、{rules.length} 条全局规则和 {caseRisks.length} 个项目风险。数据不足时，模型会明确提示需要补充数据。</p><div className="mt-5 flex max-w-2xl flex-wrap justify-center gap-2">{promptStarters.map((prompt) => <button key={prompt} onClick={() => setQuery(prompt)} className="rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-[10px] text-slate-400 hover:border-cyan-400/20 hover:text-cyan-200">{prompt}</button>)}</div></div> : <div className="mx-auto max-w-3xl space-y-5">{messages.map((message) => <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>{message.role === "assistant" && <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-cyan-400/15 bg-cyan-400/[0.07]"><Bot className="h-4 w-4 text-cyan-300" /></div>}<div className={`max-w-[88%] rounded-2xl px-4 py-3 ${message.role === "user" ? "rounded-tr-sm bg-white/[0.07] text-slate-200" : message.error ? "rounded-tl-sm border border-rose-400/15 bg-rose-400/[0.04] text-rose-100" : "rounded-tl-sm border border-white/[0.07] bg-[#0b1521] text-slate-300"}`}><p className="whitespace-pre-wrap text-sm leading-7">{message.content}</p>{message.role === "assistant" && !message.error && <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-white/[0.06] pt-2 text-[9px] text-slate-600"><span>{message.model}</span><span>需人工复核</span></div>}</div>{message.role === "user" && <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.04]"><UserRound className="h-4 w-4 text-slate-400" /></div>}</div>)}</div>}
            {sending && <div className="mx-auto mt-5 max-w-3xl"><div className="flex gap-3"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-cyan-400/15 bg-cyan-400/[0.07]"><Bot className="h-4 w-4 text-cyan-300" /></div><div className="max-w-[88%] rounded-2xl rounded-tl-sm border border-white/[0.07] bg-[#0b1521] px-4 py-3 text-sm leading-7 text-slate-300">{streamText ? <p className="whitespace-pre-wrap">{streamText}<span className="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-cyan-300 align-middle" /></p> : <span className="inline-flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" />模型正在研判工作区上下文</span>}</div></div></div>}
          </div>
          <div className="border-t border-white/[0.07] p-4"><div className="mx-auto max-w-3xl"><div className="flex items-end gap-2 rounded-2xl border border-white/[0.1] bg-white/[0.03] p-2 focus-within:border-cyan-400/30"><textarea value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); } }} rows={2} placeholder="询问当前企业项目、资料、规则、风险或研究问题…" className="min-h-12 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-white outline-none placeholder:text-slate-600" /><button onClick={() => void submit()} disabled={!query.trim() || sending} aria-label="发送研判问题" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan-300 text-[#041018] disabled:opacity-40"><CornerDownLeft className="h-4 w-4" /></button></div></div></div>
        </>}
      </Panel>
      <aside className="space-y-4">
        <Panel className="p-4"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-slate-200">当前项目上下文</p>{messages.length > 0 && <button onClick={() => clearAssistantHistory(activeCaseId)} className="text-[10px] text-slate-600 transition hover:text-rose-300">清空本项目对话</button>}</div><div className="mt-4 grid grid-cols-2 gap-2 text-center"><div className="rounded-xl border border-white/[0.07] p-3"><p className="numeric text-lg text-white">{activeCase ? 1 : 0}</p><p className="mt-1 text-[9px] text-slate-600">当前项目</p></div><div className="rounded-xl border border-white/[0.07] p-3"><p className="numeric text-lg text-white">{caseDocuments.length}</p><p className="mt-1 text-[9px] text-slate-600">项目资料</p></div><div className="rounded-xl border border-white/[0.07] p-3"><p className="numeric text-lg text-white">{rules.length}</p><p className="mt-1 text-[9px] text-slate-600">全局规则</p></div><div className="rounded-xl border border-white/[0.07] p-3"><p className="numeric text-lg text-white">{caseRisks.length}</p><p className="mt-1 text-[9px] text-slate-600">项目风险</p></div></div>{activeCase && caseDocuments.length + rules.length === 0 && <div className="mt-3 flex gap-2 rounded-xl border border-amber-400/10 bg-amber-400/[0.035] p-3"><DatabaseZap className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><p className="text-[10px] leading-5 text-amber-100/60">当前项目暂无资料和规则，模型只能提供通用框架，不能作出企业事实判断。</p></div>}</Panel>
        <Panel className="p-4"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-cyan-300" /><p className="text-xs font-semibold text-slate-200">AI 回答边界</p></div><ul className="mt-3 space-y-2 text-[10px] leading-5 text-slate-600"><li>· 只使用当前企业项目明确数据</li><li>· 区分事实、推断与数据缺口</li><li>· 不伪造证据、规则和外部来源</li><li>· 重大结论必须由人员复核</li></ul></Panel>
      </aside>
    </div>
  </div>;
}
