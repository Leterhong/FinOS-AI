"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, Bot, CheckCircle2, Cpu, FileSearch, FolderPlus, Scale, Sparkles, ShieldAlert, AlertTriangle, CalendarClock, Sparkle } from "lucide-react";
import { EmptyStateCard, MetricCard, PageIntro, Panel, PanelHeader, RiskBadge, riskMeta } from "@/components/enterprise/EnterpriseUI";
import { Button } from "@/components/ui/Button";
import { useEnterpriseStore } from "@/store/enterprise-store";
import { useModelStore } from "@/store/model-store";
import { formatWhen } from "@/lib/relative-time";

const LEVEL_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export default function EnterpriseCommandCenter() {
  const cases = useEnterpriseStore((state) => state.cases);
  const risks = useEnterpriseStore((state) => state.risks);
  const agents = useEnterpriseStore((state) => state.agents);
  const documents = useEnterpriseStore((state) => state.documents);
  const rules = useEnterpriseStore((state) => state.rules);
  const tasks = useEnterpriseStore((state) => state.tasks);
  const activeModel = useModelStore((state) => state.active);

  const highRisks = risks.filter((item) => item.level === "critical" || item.level === "high");
  const completedSetup = [cases.length > 0, documents.length > 0, Boolean(activeModel?.configured)].filter(Boolean).length;
  const averageProgress = cases.length ? Math.round(cases.reduce((sum, item) => sum + item.progress, 0) / cases.length) : 0;
  const setupReady = completedSetup === 3;

  // Priority Work：需要人工处理的真实事项（待核验风险 / 分析失败资料 / 超期任务）。
  const todayIso = new Date().toISOString().slice(0, 10);
  const priorityItems = useMemo(() => {
    const items: Array<{ key: string; href: string; level: string; title: string; detail: string; when: string; cta: string }> = [];
    for (const risk of risks.filter((item) => item.status === "待核验")) {
      items.push({
        key: risk.id, href: "/risk", level: risk.level,
        title: `${risk.company} · ${risk.title}`,
        detail: `候选风险待人工核验 · 规则依据：${risk.rule || "待补充"}`,
        when: risk.verifiedAt || "", cta: "去核验",
      });
    }
    for (const document of documents.filter((item) => item.status === "分析失败")) {
      items.push({
        key: document.id, href: "/documents", level: "high",
        title: `资料分析失败：${document.name}`,
        detail: document.error || "分析在会话结束前未完成，可删除后重新上传",
        when: document.uploadedAt, cta: "去处理",
      });
    }
    for (const task of tasks.filter((item) => item.stage !== "已完成" && /^\d{4}-\d{2}-\d{2}$/.test(item.due) && item.due < todayIso)) {
      items.push({
        key: task.id, href: "/workflows", level: "medium",
        title: `任务已超期：${task.title}`,
        detail: `${task.caseName || "未关联项目"} · 负责人 ${task.assignee || "待指派"}`,
        when: task.due, cta: "去推进",
      });
    }
    return items
      .sort((a, b) => (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9))
      .slice(0, 6);
  }, [risks, documents, tasks, todayIso]);

  // AI Intelligence Feed：AI 近期真实产出（Agent 运行 + 已解析资料）。
  const aiFeed = useMemo(() => {
    const entries: Array<{ key: string; title: string; detail: string; when: string; href: string }> = [];
    for (const run of agents) {
      if (run.status !== "已完成") continue;
      entries.push({
        key: run.id, href: "/agents",
        title: `AI 完成研判：${run.task}`,
        detail: `${run.duration} · ${run.model || "未记录模型"} · ${(run.output || "").slice(0, 80)}`,
        when: run.createdAt,
      });
    }
    for (const document of documents.filter((item) => item.status === "已解析")) {
      entries.push({
        key: document.id, href: "/documents",
        title: `AI 解析资料：${document.name}`,
        detail: `抽取 ${document.facts || 0} 条事实 · 规则命中 ${document.ruleHits || 0} 条 · ${document.model || ""}`,
        when: document.uploadedAt,
      });
    }
    return entries
      .sort((a, b) => (Date.parse(b.when) || 0) - (Date.parse(a.when) || 0))
      .slice(0, 5);
  }, [agents, documents]);

  return <div className="page-shell">
    <PageIntro
      eyebrow="Enterprise intelligence workspace"
      title="企业经营与风险决策台"
      description="从空工作区开始接入真实项目、企业资料、业务规则和你自己的大模型。系统不预置企业、金额、风险或 AI 结论。"
      actions={<Button variant="primary" href={activeModel?.configured ? "/assistant" : "/models"}><Sparkles className="h-3.5 w-3.5" />{activeModel?.configured ? "开始 AI 研判" : "配置 AI 模型"}</Button>}
    />

    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <MetricCard label="企业项目" value={String(cases.length)} detail={`${cases.filter((item) => item.status !== "已完成").length} 个进行中`} />
      <MetricCard label="研判资料" value={String(documents.length)} detail={`${documents.reduce((sum, item) => sum + (item.facts || 0), 0)} 条已抽取事实`} accent="amber" />
      <MetricCard label="风险信号" value={String(risks.length)} detail={`${highRisks.length} 项高风险`} accent="rose" />
      <MetricCard label="平均完整度" value={`${averageProgress}%`} detail={`${rules.length} 条业务规则`} accent="emerald" />
    </div>

    {priorityItems.length > 0 && <Panel>
      <PanelHeader eyebrow="Priority work" title="需要你处理" description="按风险等级排序的待办事项；全部来自当前工作区的真实状态。" action={<span className="text-[10px] text-slate-600">{priorityItems.length} 项</span>} />
      <div className="divide-y divide-white/[0.06]">
        {priorityItems.map((item) => {
          const meta = riskMeta[item.level as keyof typeof riskMeta];
          const Icon = item.level === "medium" ? CalendarClock : item.href === "/documents" ? AlertTriangle : ShieldAlert;
          return <Link key={item.key} href={item.href} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-white/[0.025]">
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border ${meta.className}`}><Icon className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-slate-200">{item.title}</span><span className="mt-0.5 block truncate text-[10px] text-slate-600">{item.detail}</span></span>
            {item.when && <span className="hidden shrink-0 text-[10px] text-slate-600 sm:block">{formatWhen(item.when)}</span>}
            <span className="shrink-0 text-[10px] text-cyan-300">{item.cta}<ArrowRight className="ml-1 inline h-3 w-3" /></span>
          </Link>;
        })}
      </div>
    </Panel>}

    {aiFeed.length > 0 && <Panel>
      <PanelHeader eyebrow="AI intelligence feed" title="AI 近期动态" description="AI 在当前工作区真实完成的分析与研判。" action={<Link href="/agents" className="flex items-center gap-1 text-xs text-cyan-300">Agent 中心<ArrowRight className="h-3 w-3" /></Link>} />
      <div className="divide-y divide-white/[0.06]">
        {aiFeed.map((entry) => <Link key={entry.key} href={entry.href} className="flex items-start gap-3 px-5 py-3.5 transition hover:bg-white/[0.025]">
          <Sparkle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-wealth" />
          <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-slate-200">{entry.title}</span><span className="mt-0.5 block truncate text-[10px] text-slate-600">{entry.detail}</span></span>
          {entry.when && <span className="shrink-0 text-[10px] text-slate-600">{formatWhen(entry.when)}</span>}
        </Link>)}
      </div>
    </Panel>}

    <Panel className="relative bg-gradient-to-r from-[#0b1825] to-[#08111c]">
      <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-cyan-400/[0.05] blur-3xl" />
      <div className="relative grid gap-6 p-5 lg:grid-cols-[1.2fr_.8fr] lg:p-6">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.18em] text-cyan-300/70"><Bot className="h-4 w-4" />AI readiness</div>
          <h2 className="mt-3 text-xl font-semibold tracking-tight text-white">{setupReady ? "推进当前项目复核" : "建立真实研判链路"}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{setupReady ? "基础链路已建立。下一步进入项目工作台，复核结构化事实、规则命中和候选风险，再形成可交付报告。" : "按创建项目、配置模型、上传资料的顺序建立链路。AI 只基于当前企业项目明确提供的上下文回答。"}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/cases" className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300"><FolderPlus className="h-3.5 w-3.5" />创建项目</Link>
            <Link href="/models" className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.07] px-3 py-2 text-xs text-cyan-200"><Cpu className="h-3.5 w-3.5" />接入模型</Link>
            <Link href="/documents" className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300"><FileSearch className="h-3.5 w-3.5" />上传资料</Link>
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-black/15 p-4">
          <div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-300">启动进度</p><span className="numeric text-xs text-cyan-300">{completedSetup}/3</span></div>
          <div className="mt-4 space-y-3">
            {[["创建企业项目", cases.length > 0], ["配置默认模型", Boolean(activeModel?.configured)], ["上传真实资料", documents.length > 0]].map(([label, done]) => <div key={String(label)} className="flex items-center gap-3 rounded-lg border border-white/[0.05] px-3 py-2.5">{done ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <span className="h-4 w-4 rounded-full border border-white/15" />}<span className={`text-xs ${done ? "text-slate-300" : "text-slate-600"}`}>{String(label)}</span></div>)}
          </div>
        </div>
      </div>
    </Panel>

    <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
      <Panel>
        <PanelHeader eyebrow="Case queue" title="项目队列" description="仅展示你创建的企业项目" action={<Link href="/cases" className="flex items-center gap-1 text-xs text-cyan-300">项目中心<ArrowRight className="h-3 w-3" /></Link>} />
        {cases.length === 0
          ? <EmptyStateCard icon={FolderPlus} title="还没有企业项目" description="创建第一个融资、尽调或经营分析项目，之后才能关联资料、规则和 AI 研判。" action={<Link href="/cases" className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">新建项目</Link>} />
          : <div className="divide-y divide-white/[0.06]">{cases.slice(0, 4).map((item) => <Link href={`/cases/${encodeURIComponent(item.id)}`} key={item.id} className="grid gap-3 px-5 py-4 transition hover:bg-white/[0.025] sm:grid-cols-[1.4fr_.65fr_.6fr] sm:items-center">
            <div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-sm font-medium text-slate-100">{item.company}</p><RiskBadge level={item.risk} /></div><p className="mt-1.5 truncate text-xs text-slate-500">{item.title} · {item.id}</p></div>
            <div><p className="numeric text-sm text-slate-200">{item.amount}</p><p className="mt-1 text-[11px] text-slate-600">负责人 {item.owner}</p></div>
            <div><div className="flex justify-between text-[10px] text-slate-500"><span>{item.status}</span><span>{item.progress}%</span></div><div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-cyan-300" style={{ width: `${item.progress}%` }} /></div></div>
          </Link>)}</div>}
      </Panel>

      <Panel>
        <PanelHeader eyebrow="AI infrastructure" title="模型连接" description="助手与 Agent 共用当前默认模型" />
        {activeModel?.configured
          ? <div className="p-5"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl border border-cyan-400/15 bg-cyan-400/[0.06]"><Cpu className="h-5 w-5 text-cyan-300" /></div><div><p className="text-sm font-semibold text-slate-100">{activeModel.displayName}</p><p className="mt-1 font-mono text-[10px] text-slate-600">{activeModel.modelName}</p></div></div><div className="mt-4 grid grid-cols-2 gap-2 text-[10px]"><div className="rounded-xl border border-white/[0.06] p-3 text-slate-500">连接状态<p className={`mt-1 text-xs ${activeModel.status === "online" ? "text-emerald-300" : "text-amber-300"}`}>{activeModel.status === "online" ? "已验证" : "待验证"}</p></div><div className="rounded-xl border border-white/[0.06] p-3 text-slate-500">Provider<p className="mt-1 text-xs text-slate-300">{activeModel.providerType}</p></div></div><Link href="/models" className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] py-2.5 text-xs text-slate-300">管理模型<ArrowRight className="h-3.5 w-3.5" /></Link></div>
          : <EmptyStateCard icon={Cpu} title="AI 尚未接入" description="添加并测试一个大模型，解锁助手、Agent 和 AI 投研。" action={<Link href="/models" className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">前往模型中心</Link>} />}
      </Panel>
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <PanelHeader eyebrow="Agent operations" title="Agent 运行记录" description="真实模型调用结果会记录在这里" action={<Link href="/agents" className="text-xs text-cyan-300">Agent 中心</Link>} />
        {agents.filter((run) => run.caseId).length === 0 ? <EmptyStateCard icon={Bot} title="尚无已归属项目的 Agent 运行" description="完成项目、模型和资料配置后，从 Agent 中心发起研判；升级前未记录项目归属的历史运行不会参与当前项目判断。" /> : <div className="divide-y divide-white/[0.06]">{agents.filter((run) => run.caseId).slice(0, 3).map((run) => <div key={run.id} className="p-4"><div className="flex items-center justify-between"><p className="text-xs font-medium text-slate-200">{run.task}</p><span className={`text-[10px] ${run.status === "已完成" ? "text-emerald-300" : run.status === "失败" ? "text-rose-300" : "text-cyan-300"}`}>{run.status}</span></div><p className="mt-2 line-clamp-2 text-[10px] leading-5 text-slate-600">{run.output || run.error || "模型正在处理当前项目上下文"}</p></div>)}</div>}
      </Panel>
      <Panel>
        <PanelHeader eyebrow="Rule readiness" title="规则与证据" description="AI 不替代规则，也不把推断伪装成事实" />
        {rules.length === 0 && documents.length === 0 ? <EmptyStateCard icon={Scale} title="尚无规则和资料" description="上传企业资料并录入适用业务规则，模型才能在明确边界内进行研判。" /> : <div className="grid grid-cols-2 gap-3 p-5"><div className="rounded-xl border border-white/[0.07] p-4"><p className="text-xs text-slate-500">业务规则</p><p className="numeric mt-2 text-2xl text-white">{rules.length}</p></div><div className="rounded-xl border border-white/[0.07] p-4"><p className="text-xs text-slate-500">企业资料</p><p className="numeric mt-2 text-2xl text-white">{documents.length}</p></div></div>}
      </Panel>
    </div>
  </div>;
}
