"use client";

import { type FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Archive, ArrowLeft, Bot, CheckCircle2, Download, FileText, Pencil, Scale, ShieldAlert, Sparkles, Workflow } from "lucide-react";
import EnterpriseDialog from "@/components/enterprise/EnterpriseDialog";
import { EmptyStateCard, PageIntro, Panel, PanelHeader, RiskBadge } from "@/components/enterprise/EnterpriseUI";
import { buildEnterpriseReport } from "@/lib/enterprise-report";
import { calculateFinancialMetrics, calculateFinancialTrends } from "@/lib/financial-analysis";
import { useEnterpriseStore } from "@/store/enterprise-store";
import { useModelStore } from "@/store/model-store";
import type { CaseStatus, RiskLevel } from "@/types/enterprise";

export default function CaseWorkspacePage() {
  const params = useParams<{ id: string }>();
  const caseId = decodeURIComponent(params.id);
  const cases = useEnterpriseStore((state) => state.cases);
  const documents = useEnterpriseStore((state) => state.documents);
  const risks = useEnterpriseStore((state) => state.risks);
  const rules = useEnterpriseStore((state) => state.rules);
  const tasks = useEnterpriseStore((state) => state.tasks);
  const briefs = useEnterpriseStore((state) => state.briefs);
  const runs = useEnterpriseStore((state) => state.agents);
  const updateCase = useEnterpriseStore((state) => state.updateCase);
  const setActiveCaseId = useEnterpriseStore((state) => state.setActiveCaseId);
  const activeModel = useModelStore((state) => state.active);
  const [editOpen, setEditOpen] = useState(false);

  const project = cases.find((item) => item.id === caseId);
  const projectDocuments = documents.filter((item) => item.caseId === caseId);
  const projectRisks = risks.filter((item) => item.caseId === caseId);
  const projectTasks = tasks.filter((item) => item.caseId === caseId);
  const projectBriefs = briefs.filter((item) => item.caseId === caseId);
  const projectRuns = runs.filter((item) => item.caseId === caseId);
  const facts = projectDocuments.flatMap((item) => item.factItems ?? []);
  const hasAnalyzedDocument = projectDocuments.some((item) => item.status === "已解析" || item.status === "待复核");
  const executedRuleCodes = [...new Set(projectDocuments.flatMap((item) => item.ruleOutcomes ?? []).map((outcome) => outcome.code))];
  const metrics = useMemo(() => calculateFinancialMetrics(facts), [facts]);
  const trends = useMemo(() => calculateFinancialTrends(facts), [facts]);

  if (!project) return <div className="page-shell"><Panel><EmptyStateCard title="项目不存在或已被移除" description="请返回项目中心选择一个仍然存在的企业项目。" action={<Link href="/cases" className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">返回项目中心</Link>} /></Panel></div>;

  const checks = [
    { label: "AI 模型可用", done: Boolean(activeModel?.configured), href: "/models" },
    { label: "已上传企业资料", done: projectDocuments.length > 0, href: `/documents?caseId=${encodeURIComponent(caseId)}` },
    { label: "存在结构化事实", done: facts.length > 0, href: `/documents?caseId=${encodeURIComponent(caseId)}` },
    { label: "事实已人工复核", done: facts.length > 0 && facts.every((item) => item.reviewStatus !== "待复核"), href: `/documents?caseId=${encodeURIComponent(caseId)}` },
    { label: "业务规则已验证并执行", done: executedRuleCodes.length > 0 && executedRuleCodes.every((code) => rules.some((item) => item.code === code && item.coverage === "已测试")), href: "/rules" },
    { label: "风险线索已处理", done: hasAnalyzedDocument && projectRisks.every((item) => item.status !== "待核验"), href: "/risk" },
    { label: "人工流程已闭环", done: hasAnalyzedDocument && projectTasks.every((item) => item.stage === "已完成"), href: "/workflows" },
  ];
  const completeCount = checks.filter((item) => item.done).length;

  const saveProject = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    updateCase(project.id, {
      company: String(data.get("company")), title: String(data.get("title")), industry: String(data.get("industry")),
      amount: String(data.get("amount")), owner: String(data.get("owner")), status: String(data.get("status")) as CaseStatus,
      risk: String(data.get("risk")) as RiskLevel, nextAction: String(data.get("nextAction")),
    });
    setEditOpen(false);
  };

  const exportReport = () => {
    const markdown = buildEnterpriseReport({ project, documents: projectDocuments, risks: projectRisks, rules, tasks: projectTasks, briefs: projectBriefs, runs: projectRuns });
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${project.company}-${project.title}-研判报告.md`.replace(/[\\/:*?"<>|]/g, "-");
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return <div className="page-shell">
    <Link href="/cases" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-300"><ArrowLeft className="h-3.5 w-3.5" />返回项目中心</Link>
    <PageIntro eyebrow={`Case workspace · ${project.id}`} title={project.company} description={`${project.title} · ${project.industry || "未填写行业"}。项目工作台统一汇总证据、风险、规则、流程与交付结果。`} actions={<><button type="button" onClick={() => setEditOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-300"><Pencil className="h-3.5 w-3.5" />编辑项目</button><button type="button" onClick={exportReport} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]"><Download className="h-3.5 w-3.5" />导出研判报告</button></>} />

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Panel className="p-4"><p className="text-[10px] text-slate-600">项目状态</p><div className="mt-2 flex items-center gap-2"><RiskBadge level={project.risk} /><span className="text-xs text-slate-300">{project.archivedAt ? "已归档" : project.status}</span></div></Panel>
      <Panel className="p-4"><p className="text-[10px] text-slate-600">融资/分析规模</p><p className="numeric mt-2 text-lg text-white">{project.amount || "未填写"}</p></Panel>
      <Panel className="p-4"><p className="text-[10px] text-slate-600">负责人</p><p className="mt-2 text-sm text-white">{project.owner || "待指派"}</p></Panel>
      <Panel className="p-4"><p className="text-[10px] text-slate-600">核心对象</p><p className="numeric mt-2 text-lg text-white">{projectDocuments.length} / {facts.length} / {projectRisks.length}</p><p className="mt-1 text-[9px] text-slate-600">资料 / 事实 / 风险</p></Panel>
    </div>

    <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
      <Panel><PanelHeader eyebrow="Completion evidence" title="项目完整度清单" description="百分比由明确完成项计算，可查看每一项缺口" /><div className="p-5"><div className="flex items-end justify-between"><div><p className="numeric text-3xl text-white">{Math.round((completeCount / checks.length) * 100)}%</p><p className="mt-1 text-[10px] text-slate-600">{completeCount}/{checks.length} 项完成</p></div><p className="max-w-sm text-right text-xs text-cyan-100/60">下一步：{project.nextAction}</p></div><div className="mt-5 grid gap-2 sm:grid-cols-2">{checks.map((item) => <Link key={item.label} href={item.href} onClick={() => setActiveCaseId(caseId)} className="flex items-center gap-2 rounded-xl border border-white/[0.07] p-3 text-xs text-slate-400 hover:border-cyan-400/20"><CheckCircle2 className={`h-4 w-4 ${item.done ? "text-emerald-300" : "text-slate-700"}`} />{item.label}</Link>)}</div></div></Panel>
      <Panel><PanelHeader eyebrow="Quick actions" title="项目操作" /><div className="grid grid-cols-2 gap-2 p-4">{[[FileText,"资料研判",`/documents?caseId=${caseId}`],[Bot,"运行 Agent","/agents"],[ShieldAlert,"风险核验","/risk"],[Workflow,"流程任务","/workflows"],[Sparkles,"投研底稿","/research"],[Scale,"规则库","/rules"]].map(([Icon,label,href]) => { const ItemIcon = Icon as typeof FileText; return <Link key={String(label)} href={String(href)} onClick={() => setActiveCaseId(caseId)} className="rounded-xl border border-white/[0.07] p-3 text-xs text-slate-300 hover:border-cyan-400/20"><ItemIcon className="mb-2 h-4 w-4 text-cyan-300" />{String(label)}</Link>; })}</div></Panel>
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      <Panel><PanelHeader eyebrow="Evidence ledger" title="结构化事实与引用" description="只展示当前项目资料提取的事实；待复核事实不能作为最终结论" />{facts.length === 0 ? <EmptyStateCard icon={FileText} title="尚无结构化事实" description="上传并分析企业资料后，事实、原文和位置会汇总到这里。" /> : <div className="divide-y divide-white/[0.06]">{facts.slice(0, 12).map((fact) => <article key={fact.id} className="p-4"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-medium text-white">{fact.topic}</span><span className="numeric text-xs text-cyan-200">{fact.value}{fact.unit}</span><span className={`ml-auto text-[9px] ${fact.reviewStatus === "已确认" ? "text-emerald-300" : fact.reviewStatus === "已驳回" ? "text-rose-300" : "text-amber-300"}`}>{fact.reviewStatus}</span></div><p className="mt-2 text-[10px] leading-5 text-slate-500">“{fact.quote}”</p><p className="mt-1 text-[9px] text-slate-700">{fact.documentName} · {fact.location || "位置未提供"} {fact.period ? `· ${fact.period}` : ""}</p></article>)}</div>}</Panel>
      <Panel><PanelHeader eyebrow="Financial analysis" title="确定性财务指标" description="仅在相关科目存在时计算，不用模型补齐缺失数据" />{metrics.length === 0 ? <EmptyStateCard title="暂时无法计算财务指标" description="需要流动资产、流动负债、资产、负债、营业收入、净利润、平均应收账款或经营现金流等结构化事实。" /> : <div className="grid gap-3 p-4 sm:grid-cols-2">{metrics.map((metric) => <div key={metric.id} className="rounded-xl border border-white/[0.07] p-4"><p className="text-[10px] text-slate-600">{metric.category}</p><p className="mt-1 text-xs text-slate-300">{metric.name}</p><p className="numeric mt-2 text-xl text-white">{metric.displayValue}</p><p className="mt-2 text-[10px] leading-5 text-slate-500">{metric.interpretation}</p><p className="mt-2 text-[9px] text-cyan-300/60">引用：{metric.sourceFactIds.join("、")}</p></div>)}</div>}{trends.length > 0 && <div className="border-t border-white/[0.06] p-4"><p className="text-xs font-semibold text-slate-300">跨期变化</p>{trends.map((trend) => <p key={`${trend.topic}-${trend.toPeriod}`} className="mt-2 text-[10px] text-slate-500">{trend.topic}：{trend.fromPeriod} → {trend.toPeriod}，变化 {trend.changeRate.toFixed(1)}%</p>)}</div>}</Panel>
    </div>

    <div className="grid gap-4 lg:grid-cols-3">
      <Panel><PanelHeader eyebrow="Risk" title="候选与已确认风险" /><div className="space-y-2 p-4">{projectRisks.length ? projectRisks.map((risk) => <div key={risk.id} className="rounded-xl border border-white/[0.07] p-3"><div className="flex items-center gap-2"><RiskBadge level={risk.level} /><span className="text-[9px] text-slate-600">{risk.status === "待核验" ? "候选风险" : risk.status}</span></div><p className="mt-2 text-xs text-slate-300">{risk.title}</p></div>) : <p className="text-xs text-slate-600">尚无风险线索</p>}</div></Panel>
      <Panel><PanelHeader eyebrow="Workflow" title="人工任务" /><div className="space-y-2 p-4">{projectTasks.length ? projectTasks.map((task) => <div key={task.id} className="rounded-xl border border-white/[0.07] p-3"><p className="text-xs text-slate-300">{task.title}</p><p className="mt-1 text-[9px] text-slate-600">{task.stage} · {task.assignee} · {task.due}</p></div>) : <p className="text-xs text-slate-600">尚无人工任务</p>}</div></Panel>
      <Panel><PanelHeader eyebrow="Audit trail" title="项目活动摘要" /><div className="space-y-3 p-4 text-[10px] text-slate-500"><p>创建项目：{project.createdAt ? new Date(project.createdAt).toLocaleString("zh-CN") : "历史记录未提供时间"}</p><p>资料分析：{projectDocuments.length} 份</p><p>Agent 运行：{projectRuns.length} 次</p><p>研究底稿：{projectBriefs.length} 份</p><p>流程事件：{projectTasks.reduce((sum, item) => sum + (item.history?.length ?? 0), 0)} 条</p>{projectTasks.flatMap((item) => item.history ?? []).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3).map((event) => <div key={event.id} className="border-t border-white/[0.06] pt-2"><p className="text-slate-400">{event.action} · {event.actor}</p><p className="mt-1 text-slate-700">{new Date(event.at).toLocaleString("zh-CN")}{event.note ? ` · ${event.note}` : ""}</p></div>)}</div></Panel>
    </div>

    <div className="grid gap-4 lg:grid-cols-3">
      <Panel><PanelHeader eyebrow="Rule readiness" title="工作区适用规则" description="规则为工作区级，项目负责人仍需确认适用性" /><div className="space-y-2 p-4">{rules.length ? rules.slice(0, 6).map((rule) => <div key={rule.id} className="rounded-xl border border-white/[0.07] p-3"><p className="text-xs text-slate-300">{rule.code}@{rule.version} · {rule.name}</p><p className="mt-1 text-[9px] text-slate-600">{rule.domain} · {rule.coverage} · {rule.coverageRate}%</p></div>) : <p className="text-xs text-slate-600">尚无工作区规则</p>}</div></Panel>
      <Panel><PanelHeader eyebrow="Agent records" title="项目 Agent 运行" /><div className="space-y-2 p-4">{projectRuns.length ? projectRuns.slice(0, 6).map((run) => <div key={run.id} className="rounded-xl border border-white/[0.07] p-3"><p className="text-xs text-slate-300">{run.task}</p><p className="mt-1 text-[9px] text-slate-600">{run.status} · {run.model || "未记录模型"} · {run.id}</p></div>) : <p className="text-xs text-slate-600">尚无当前项目运行记录</p>}</div></Panel>
      <Panel><PanelHeader eyebrow="Research records" title="项目研究底稿" /><div className="space-y-2 p-4">{projectBriefs.length ? projectBriefs.slice(0, 6).map((brief) => <div key={brief.id} className="rounded-xl border border-white/[0.07] p-3"><p className="text-xs text-slate-300">{brief.title}</p><p className="mt-1 text-[9px] text-slate-600">{brief.topic} · {brief.model || "未记录模型"}</p></div>) : <p className="text-xs text-slate-600">尚无当前项目研究底稿</p>}</div></Panel>
    </div>

    <Panel><PanelHeader eyebrow="Deliverable" title="研判交付" description="导出的 Markdown 报告包含事实引用、财务指标、风险状态和人工流程" /><div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium text-slate-200">项目研判报告</p><p className="mt-1 text-[10px] text-slate-600">导出前请先处理待复核事实与候选风险。</p></div><button type="button" onClick={exportReport} className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06] px-4 py-2.5 text-xs text-cyan-200"><Download className="h-3.5 w-3.5" />下载 Markdown 报告</button></div></Panel>

    <div className="flex justify-end"><button type="button" onClick={() => updateCase(project.id, { archivedAt: project.archivedAt ? undefined : new Date().toISOString() })} className="inline-flex items-center gap-2 text-[10px] text-slate-600 hover:text-amber-300"><Archive className="h-3.5 w-3.5" />{project.archivedAt ? "恢复项目" : "归档项目"}</button></div>

    <EnterpriseDialog open={editOpen} onClose={() => setEditOpen(false)} title="编辑企业项目" description="项目状态和责任人变更会同步到工作区">
      <form onSubmit={saveProject} className="space-y-4">{[["company","企业名称",project.company],["title","研判任务",project.title],["industry","所属行业",project.industry],["amount","融资/分析规模",project.amount],["owner","负责人",project.owner],["nextAction","下一步动作",project.nextAction]].map(([name,label,value]) => <label key={name} className="block"><span className="mb-1.5 block text-[11px] text-slate-400">{label}</span><input required name={name} defaultValue={value} className="field-control" /></label>)}<div className="grid grid-cols-2 gap-3"><label><span className="mb-1.5 block text-[11px] text-slate-400">状态</span><select name="status" defaultValue={project.status} className="field-control"><option>研判中</option><option>资料补充</option><option>待复核</option><option>已完成</option></select></label><label><span className="mb-1.5 block text-[11px] text-slate-400">风险等级</span><select name="risk" defaultValue={project.risk} className="field-control"><option value="low">低风险</option><option value="medium">中风险</option><option value="high">高风险</option><option value="critical">重大风险</option></select></label></div><div className="flex justify-end gap-2"><button type="button" onClick={() => setEditOpen(false)} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-400">取消</button><button type="submit" className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">保存项目</button></div></form>
    </EnterpriseDialog>
  </div>;
}
