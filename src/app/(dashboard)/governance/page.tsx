"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Activity, BookOpenCheck, Cable, History, Loader2, ShieldCheck, UsersRound } from "lucide-react";
import { EmptyStateCard, MetricCard, PageIntro, Panel, PanelHeader } from "@/components/enterprise/EnterpriseUI";
import { governanceApi, governancePost } from "@/lib/governance-client";
import EnterpriseDialog from "@/components/enterprise/EnterpriseDialog";
import { ensureWorkspaceSession } from "@/lib/workspace-session";
import { useEnterpriseStore } from "@/store/enterprise-store";
import type { DataClassification } from "@/types/enterprise";

type Member = { id: string; userId?: string; email: string; role: string; clearance: string; status: string };
type Grant = { id: string; caseId: string; userId: string; permission: string };
type Audit = { id: string; action: string; resourceType: string; resourceId: string; caseId?: string; outcome: string; createdAt: string };
type Review = { id: string; caseId?: string; resourceType: string; resourceId: string; title: string; assignedRole: string; status: string; requestedBy: string; decidedBy?: string; decisionNote?: string; createdAt: string };
type EvalCase = { id: string; name: string; prompt: string; expectedKeywords: string[]; forbiddenKeywords: string[] };
type EvalRun = { id: string; evalCaseId: string; modelId: string; score: number; passed: boolean; guardFlags: string[]; reviewStatus: string; createdAt: string };
type Connector = { id: string; caseId: string; name: string; kind: string; sourceUrl: string; status: string; lastError?: string; lastSync?: { recordCount?: number; documentId?: string }; lastSyncedAt?: string };
type GovernanceSnapshot = { organization: { id: string; name: string }; organizations: Array<{ id: string; name: string; role: string }>; members: Member[]; grants: Grant[]; audits: Audit[]; reviews: Review[]; evalCases: EvalCase[]; evalRuns: EvalRun[]; connectors: Connector[] };
type Observability = { requests: Record<string, unknown>; ai: { calls: number; tokens: number; avgLatencyMs: number }; governance: { pendingReviews: number; failedConnectors: number; auditEvents: number } };
type RuleHistory = { revisions: Array<{ id: string; version: string; reason: string; createdAt: string; snapshot: Record<string, unknown> }> };

const tabs = ["权限与分级", "规则与复核", "模型评测", "连接器", "可观测性"] as const;
type Tab = typeof tabs[number];
const classifications: Array<{ value: DataClassification; label: string }> = [
  { value: "public", label: "公开" }, { value: "internal", label: "内部" },
  { value: "confidential", label: "机密" }, { value: "restricted", label: "严格受限" },
];

export default function GovernancePage() {
  const cases = useEnterpriseStore((state) => state.cases);
  const risks = useEnterpriseStore((state) => state.risks);
  const documents = useEnterpriseStore((state) => state.documents);
  const rules = useEnterpriseStore((state) => state.rules);
  const updateCase = useEnterpriseStore((state) => state.updateCase);
  const syncFromServer = useEnterpriseStore((state) => state.syncFromServer);
  const [tab, setTab] = useState<Tab>(tabs[0]);
  const [snapshot, setSnapshot] = useState<GovernanceSnapshot | null>(null);
  const [observability, setObservability] = useState<Observability | null>(null);
  const [history, setHistory] = useState<{ ruleId: string; data: RuleHistory } | null>(null);
  const [busy, setBusy] = useState("");
  const [deciding, setDeciding] = useState<{ review: Review; status: string } | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [resourceType, setResourceType] = useState("risk");
  const [resourceId, setResourceId] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (organizationId?: string) => {
    setBusy("load");
    try {
      const query = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : "";
      const next = await governanceApi<GovernanceSnapshot>(`/snapshot${query}`);
      setSnapshot(next);
      try { setObservability(await governanceApi<Observability>(`/observability${query}`)); }
      catch { setObservability(null); }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "治理数据加载失败");
    } finally {
      setBusy("");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const act = async (key: string, operation: () => Promise<unknown>, message: string) => {
    setBusy(key); setNotice("");
    try { await operation(); setNotice(message); await load(snapshot?.organization.id); }
    catch (error) { setNotice(error instanceof Error ? error.message : "操作失败"); }
    finally { setBusy(""); }
  };

  const submitMember = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void act("member", () => governancePost("/members", { organizationId: snapshot?.organization.id, email: form.get("email"), role: form.get("role"), clearance: form.get("clearance") }), "成员与数据权限已保存");
    event.currentTarget.reset();
  };

  const submitGrant = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void act("grant", () => governancePost("/grants", { caseId: form.get("caseId"), userId: form.get("userId"), permission: form.get("permission") }), "项目授权已更新");
  };

  const classify = (caseId: string, classification: DataClassification) => void act(`classify-${caseId}`, async () => {
    await governancePost("/classification", { resourceType: "case", resourceId: caseId, classification });
    updateCase(caseId, { classification });
  }, "数据级别已更新");

  const submitReview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void act("review", () => governancePost("/reviews", { organizationId: snapshot?.organization.id, caseId: form.get("caseId"), resourceType: form.get("resourceType"), resourceId: form.get("resourceId"), title: form.get("title"), assignedRole: "reviewer", requestedBy: form.get("requestedBy") }), "人工复核任务已创建");
    event.currentTarget.reset();
  };

  const decide = (review: Review, status: "approved" | "rejected") => {
    setDeciding({ review, status });
    setDecisionNote("");
  };

  const submitEval = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const list = (name: string) => String(form.get(name) || "").split(/[，,\n]/).map((item) => item.trim()).filter(Boolean);
    void act("eval-create", () => governancePost("/evaluations/cases", { organizationId: snapshot?.organization.id, name: form.get("name"), prompt: form.get("prompt"), expectedKeywords: list("expected"), forbiddenKeywords: list("forbidden") }), "评测样本已加入评测集");
    event.currentTarget.reset();
  };

  const runEvaluation = (item: EvalCase) => void act(`eval-${item.id}`, async () => {
    await ensureWorkspaceSession();
    const response = await fetch("/api/models/playground", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: item.prompt }) });
    const payload = await response.json().catch(() => null) as { result?: { ok: boolean; reply: string; model: string; latencyMs: number; error?: string }; error?: string } | null;
    if (!response.ok || !payload?.result?.ok) throw new Error(payload?.result?.error || payload?.error || "模型评测执行失败");
    await governancePost(`/evaluations/cases/${item.id}/record`, { modelId: payload.result.model, output: payload.result.reply, latencyMs: payload.result.latencyMs });
  }, "真实模型评测已完成并进入人工复核");

  const submitConnector = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void act("connector", () => governancePost("/connectors", { caseId: form.get("caseId"), name: form.get("name"), kind: form.get("kind"), sourceUrl: form.get("sourceUrl"), bearerToken: form.get("bearerToken") }), "连接器配置已加密保存");
    event.currentTarget.reset();
  };

  const syncConnector = (item: Connector) => void act(`connector-${item.id}`, async () => {
    await governancePost(`/connectors/${item.id}/sync`, {});
    await syncFromServer();
  }, "数据源已同步，生成的资料等待人工复核");

  const loadHistory = async (ruleId: string) => {
    setBusy(`history-${ruleId}`);
    try { setHistory({ ruleId, data: await governanceApi<RuleHistory>(`/rules/${ruleId}/history`) }); }
    catch (error) { setNotice(error instanceof Error ? error.message : "规则历史加载失败"); }
    finally { setBusy(""); }
  };

  const activeMembers = useMemo(() => snapshot?.members.filter((member) => member.userId && member.role !== "owner") ?? [], [snapshot]);
  const organizationCases = useMemo(() => cases.filter((item) => item.organizationId === snapshot?.organization.id), [cases, snapshot?.organization.id]);
  const organizationRules = useMemo(() => rules.filter((item) => item.organizationId === snapshot?.organization.id), [rules, snapshot?.organization.id]);
  const pendingReviews = snapshot?.reviews.filter((review) => review.status === "pending") ?? [];
  const requestEndpoints = observability ? Object.keys(observability.requests).filter((key) => key !== "_dropped_endpoints").length : 0;

  const submitDecision = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!deciding) return;
    const note = decisionNote.trim();
    if (!note) return;
    // decidedBy 已由服务端写入已认证身份，前端不再采集复核人。
    void act(`review-${deciding.review.id}`, () => governancePost(`/reviews/${deciding.review.id}/decision`, { status: deciding.status, decidedBy: "server", note }), "复核结论已留痕");
    setDeciding(null);
    setDecisionNote("");
  };

  // 按资源类型列出可选对象：不再要求用户手抄资源 ID。
  const selectableResources = useMemo(() => {
    const orgCaseIds = new Set(organizationCases.map((item) => item.id));
    if (resourceType === "risk") {
      return risks.filter((item) => orgCaseIds.has(item.caseId)).map((item) => ({ id: item.id, label: `${item.company} · ${item.title}` }));
    }
    if (resourceType === "document") {
      return documents.filter((item) => orgCaseIds.has(item.caseId)).map((item) => ({ id: item.id, label: item.name }));
    }
    return [];
  }, [resourceType, risks, documents, organizationCases]);

  return <div className="page-shell">
    <PageIntro eyebrow="Enterprise governance" title="企业治理与质量控制" description="组织权限、数据分级、规则版本、人工复核、模型评测、数据源和运行观测共用一条可追溯治理链路。" actions={<><select aria-label="当前治理组织" value={snapshot?.organization.id ?? ""} onChange={(event) => void load(event.target.value)} className="field-control min-w-44">{(snapshot?.organizations ?? []).map((organization) => <option key={organization.id} value={organization.id}>{organization.name} · {organization.role}</option>)}</select><button onClick={() => void load(snapshot?.organization.id)} disabled={busy === "load"} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-300">{busy === "load" ? "刷新中" : "刷新治理数据"}</button></>} />
    {notice && <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/[0.05] px-4 py-3 text-xs text-cyan-100">{notice}</div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="组织成员" value={String(snapshot?.members.length ?? 0)} detail="含邀请" />
      <MetricCard label="待人工复核" value={String(pendingReviews.length)} detail="职责分离" accent="amber" />
      <MetricCard label="审计事件" value={String(observability?.governance.auditEvents ?? 0)} detail="不可见操作也留痕" accent="emerald" />
      <MetricCard label="AI 调用" value={String(observability?.ai.calls ?? 0)} detail={`${observability?.ai.tokens ?? 0} tokens`} />
    </div>
    <div className="flex flex-wrap gap-2">{tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`rounded-xl border px-3 py-2 text-[11px] ${tab === item ? "border-cyan-400/25 bg-cyan-400/[0.08] text-cyan-200" : "border-white/[0.08] text-slate-500"}`}>{item}</button>)}</div>

    {tab === "权限与分级" && <div className="grid gap-4 xl:grid-cols-2">
      <Panel><PanelHeader eyebrow="Organization & RBAC" title={snapshot?.organization.name || "企业组织"} description="Owner / Admin / Analyst / Reviewer / Viewer 五级角色，数据权限独立控制。" /><form onSubmit={submitMember} className="grid gap-3 p-5 sm:grid-cols-3"><input required name="email" type="email" placeholder="成员邮箱" className="field-control sm:col-span-3" /><select name="role" className="field-control"><option value="analyst">分析师</option><option value="reviewer">复核人</option><option value="viewer">只读</option><option value="admin">管理员</option></select><select name="clearance" className="field-control"><option value="internal">内部</option><option value="confidential">机密</option><option value="restricted">严格受限</option><option value="public">公开</option></select><button disabled={busy === "member"} className="rounded-xl bg-cyan-300 px-3 text-xs font-semibold text-[#041018]">保存成员</button></form><div className="divide-y divide-white/[0.06]">{snapshot?.members.map((member) => <div key={member.id} className="flex items-center gap-3 px-5 py-3 text-xs"><UsersRound className="h-4 w-4 text-cyan-300" /><span className="min-w-0 flex-1 truncate text-slate-300">{member.email}</span><span className="text-slate-500">{member.role}</span><span className="text-slate-600">{member.clearance}</span><span className={`rounded-md px-2 py-0.5 text-[9px] ${member.status === "active" ? "border border-emerald-400/20 text-emerald-300" : "border border-amber-400/20 text-amber-300"}`}>{member.status === "active" ? "已生效" : "待本人确认"}</span>{member.status !== "active" && <button type="button" onClick={() => void act(`member-accept-${member.id}`, () => governancePost(`/members/${member.id}/accept`, {}), "邀请已确认")} className="rounded-lg border border-cyan-400/20 px-2 py-1 text-[9px] text-cyan-200">这是我的邮箱，确认加入</button>}</div>)}</div></Panel>
      <Panel><PanelHeader eyebrow="Project permissions" title="项目最小权限" description="非管理员成员必须获得明确项目授权，且不得超过其数据密级。" /><form onSubmit={submitGrant} className="grid gap-3 p-5 sm:grid-cols-3"><select required name="caseId" className="field-control">{organizationCases.map((item) => <option key={item.id} value={item.id}>{item.company} · {item.title}</option>)}</select><select required name="userId" className="field-control">{activeMembers.map((member) => <option key={member.id} value={member.userId}>{member.email}</option>)}</select><select name="permission" className="field-control"><option value="viewer">查看</option><option value="reviewer">复核</option><option value="editor">编辑</option><option value="admin">项目管理</option></select><button disabled={!organizationCases.length || !activeMembers.length || busy === "grant"} className="rounded-xl bg-cyan-300 px-3 py-2.5 text-xs font-semibold text-[#041018] sm:col-span-3 disabled:opacity-40">保存项目授权</button></form><div className="px-5 pb-5 text-[10px] text-slate-600">已配置 {snapshot?.grants.length ?? 0} 条显式授权。</div></Panel>
      <Panel className="xl:col-span-2"><PanelHeader eyebrow="Data classification" title="项目数据分级" description="外部连接器资料继承项目密级；用户数据许可低于密级时不可访问。" /><div className="grid gap-3 p-5 md:grid-cols-2">{organizationCases.length ? organizationCases.map((item) => <div key={item.id} className="rounded-xl border border-white/[0.07] p-3"><p className="text-xs text-slate-200">{item.company} · {item.title}</p><select value={item.classification ?? "internal"} onChange={(event) => classify(item.id, event.target.value as DataClassification)} className="field-control mt-3">{classifications.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}</select></div>) : <p className="text-xs text-slate-600">创建项目后可设置数据级别。</p>}</div></Panel>
    </div>}

    {tab === "规则与复核" && <div className="grid gap-4 xl:grid-cols-2">
      <Panel><PanelHeader eyebrow="Rule history" title="规则历史与版本回放" description="每次保存都会生成完整快照，可审查并回放历史版本。" /><div className="divide-y divide-white/[0.06]">{organizationRules.length ? organizationRules.map((rule) => <div key={rule.id} className="flex items-center gap-3 px-5 py-4"><History className="h-4 w-4 text-cyan-300" /><div className="min-w-0 flex-1"><p className="truncate text-xs text-slate-200">{rule.code}@{rule.version} · {rule.name}</p><p className="mt-1 text-[10px] text-slate-600">{rule.domain}</p></div><button onClick={() => void loadHistory(rule.id)} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] text-slate-400">历史</button></div>) : <EmptyStateCard icon={History} title="尚无规则" description="在规则库创建规则后，每次保存都会记录版本快照。" />}</div>{history && <div className="border-t border-white/[0.07] p-5"><p className="text-xs font-semibold text-slate-300">历史版本</p><div className="mt-3 space-y-2">{(history.data.revisions ?? []).map((revision) => <div key={revision.id} className="flex items-center gap-3 rounded-xl border border-white/[0.07] p-3"><div className="flex-1"><p className="text-xs text-slate-300">{revision.version} · {revision.reason}</p><p className="mt-1 text-[9px] text-slate-600">{new Date(revision.createdAt).toLocaleString("zh-CN")}</p></div><button onClick={() => void act(`replay-${revision.id}`, () => governancePost(`/rules/${history.ruleId}/replay/${revision.id}`, {}), "规则历史版本已回放")} className="rounded-lg border border-amber-400/20 px-2.5 py-1.5 text-[10px] text-amber-200">回放</button></div>)}</div></div>}</Panel>
      <Panel><PanelHeader eyebrow="Human review" title="生产级人工复核队列" description="关键输出须由复核角色填写依据后批准或驳回。" /><form onSubmit={submitReview} className="grid gap-3 p-5"><select name="caseId" className="field-control"><option value="">工作区级</option>{organizationCases.map((item) => <option key={item.id} value={item.id}>{item.company} · {item.title}</option>)}</select><div className="grid gap-3 sm:grid-cols-2"><select name="resourceType" className="field-control"><option value="risk">风险</option><option value="document">资料</option><option value="report">报告</option><option value="workflow">流程</option></select><input required name="resourceId" placeholder="资源 ID" className="field-control" /></div><input required name="title" placeholder="复核事项" className="field-control" /><input required name="requestedBy" placeholder="发起人" className="field-control" /><button className="rounded-xl bg-cyan-300 py-2.5 text-xs font-semibold text-[#041018]">创建复核任务</button></form><div className="divide-y divide-white/[0.06]">{snapshot?.reviews.slice(0, 12).map((review) => <div key={review.id} className="px-5 py-4"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${review.status === "approved" ? "bg-emerald-400" : review.status === "rejected" ? "bg-rose-400" : "bg-amber-400"}`} /><p className="flex-1 text-xs text-slate-200">{review.title}</p><span className="text-[9px] text-slate-600">{review.status}</span></div>{review.status === "pending" && <div className="mt-3 flex gap-2"><button onClick={() => decide(review, "approved")} className="rounded-lg border border-emerald-400/20 px-2.5 py-1.5 text-[10px] text-emerald-300">批准</button><button onClick={() => decide(review, "rejected")} className="rounded-lg border border-rose-400/20 px-2.5 py-1.5 text-[10px] text-rose-300">驳回</button></div>}</div>)}</div></Panel>
    </div>}

    {tab === "模型评测" && <div className="grid gap-4 xl:grid-cols-[.8fr_1.2fr]"><Panel><PanelHeader eyebrow="Evaluation set" title="新增评测样本" description="以预期关键词、禁止关键词和提示词防护共同形成可复现评分。" /><form onSubmit={submitEval} className="space-y-3 p-5"><input required name="name" placeholder="样本名称" className="field-control" /><textarea required name="prompt" rows={5} placeholder="真实企业金融研判问题" className="field-control resize-none" /><input name="expected" placeholder="预期关键词，逗号分隔" className="field-control" /><input name="forbidden" placeholder="禁止出现的词，逗号分隔" className="field-control" /><button className="w-full rounded-xl bg-cyan-300 py-2.5 text-xs font-semibold text-[#041018]">加入评测集</button></form></Panel><Panel><PanelHeader eyebrow="Guarded evaluation" title="真实模型评测记录" description="调用当前模型中心默认模型，输出自动评分后必须进入人工复核。" /><div className="divide-y divide-white/[0.06]">{snapshot?.evalCases.length ? snapshot.evalCases.map((item) => { const last = snapshot.evalRuns.find((run) => run.evalCaseId === item.id); return <div key={item.id} className="p-5"><div className="flex items-start gap-3"><BookOpenCheck className="mt-0.5 h-4 w-4 text-cyan-300" /><div className="min-w-0 flex-1"><p className="text-xs text-slate-200">{item.name}</p><p className="mt-1 line-clamp-2 text-[10px] leading-5 text-slate-600">{item.prompt}</p>{last && <p className={`mt-2 text-[10px] ${last.passed ? "text-emerald-300" : "text-amber-300"}`}>最近评分 {last.score}% · {last.modelId} · {last.guardFlags.join(", ") || "无防护命中"}</p>}</div><button onClick={() => runEvaluation(item)} disabled={busy === `eval-${item.id}`} className="rounded-lg border border-cyan-400/20 px-3 py-2 text-[10px] text-cyan-200">{busy === `eval-${item.id}` ? "运行中" : "运行评测"}</button></div></div>; }) : <EmptyStateCard icon={BookOpenCheck} title="评测集为空" description="先创建覆盖资料理解、规则匹配和风险提示的真实样本。" />}</div></Panel></div>}

    {tab === "连接器" && <div className="grid gap-4 xl:grid-cols-[.8fr_1.2fr]"><Panel><PanelHeader eyebrow="Enterprise data sources" title="新增受控数据源" description="当前支持公网 JSON/CSV API；禁止内网、云元数据和自动重定向，凭据加密保存。" /><form onSubmit={submitConnector} className="space-y-3 p-5"><select required name="caseId" className="field-control">{organizationCases.map((item) => <option key={item.id} value={item.id}>{item.company} · {item.title}</option>)}</select><input required name="name" placeholder="数据源名称" className="field-control" /><select name="kind" className="field-control"><option value="json_api">JSON API</option><option value="csv_api">CSV API</option></select><input required name="sourceUrl" type="url" placeholder="https://data.example.com/report" className="field-control" /><input name="bearerToken" type="password" autoComplete="new-password" placeholder="Bearer Token（可选，仅服务端加密保存）" className="field-control" /><button disabled={!organizationCases.length} className="w-full rounded-xl bg-cyan-300 py-2.5 text-xs font-semibold text-[#041018] disabled:opacity-40">保存连接器</button></form></Panel><Panel><PanelHeader eyebrow="Sync & lineage" title="连接器运行状态" description="同步结果生成项目资料、继承密级并自动进入复核队列。" /><div className="divide-y divide-white/[0.06]">{snapshot?.connectors.length ? snapshot.connectors.map((item) => <div key={item.id} className="p-5"><div className="flex items-start gap-3"><Cable className="mt-0.5 h-4 w-4 text-cyan-300" /><div className="min-w-0 flex-1"><p className="text-xs text-slate-200">{item.name}</p><p className="mt-1 truncate text-[10px] text-slate-600">{item.sourceUrl}</p><p className={`mt-2 text-[10px] ${item.status === "connected" ? "text-emerald-300" : item.status === "failed" ? "text-rose-300" : "text-amber-300"}`}>{item.status}{item.lastSync?.recordCount !== undefined ? ` · ${item.lastSync.recordCount} 条` : ""}</p></div><button onClick={() => syncConnector(item)} disabled={busy === `connector-${item.id}`} className="rounded-lg border border-cyan-400/20 px-3 py-2 text-[10px] text-cyan-200">同步</button></div></div>) : <EmptyStateCard icon={Cable} title="尚无数据源" description="配置真实企业数据 API 后再发起同步，系统不会生成演示记录。" />}</div></Panel></div>}

    {tab === "可观测性" && <div className="grid gap-4 lg:grid-cols-3"><Panel><PanelHeader eyebrow="API telemetry" title="请求观测" /><div className="p-5"><Activity className="h-5 w-5 text-cyan-300" /><p className="numeric mt-4 text-3xl text-white">{requestEndpoints}</p><p className="mt-2 text-xs text-slate-500">已归一化接口维度，记录调用数、错误率、平均与最大耗时。</p></div></Panel><Panel><PanelHeader eyebrow="AI telemetry" title="模型调用" /><div className="p-5"><p className="numeric text-3xl text-white">{observability?.ai.avgLatencyMs ?? 0} ms</p><p className="mt-2 text-xs text-slate-500">平均调用耗时 · 累计 {observability?.ai.tokens ?? 0} Token。</p></div></Panel><Panel><PanelHeader eyebrow="Control health" title="治理健康" /><div className="space-y-3 p-5 text-xs"><p className="flex justify-between text-slate-400"><span>待复核</span><span>{observability?.governance.pendingReviews ?? 0}</span></p><p className="flex justify-between text-slate-400"><span>失败连接器</span><span>{observability?.governance.failedConnectors ?? 0}</span></p><p className="flex justify-between text-slate-400"><span>审计事件</span><span>{observability?.governance.auditEvents ?? 0}</span></p></div></Panel><Panel className="lg:col-span-3"><PanelHeader eyebrow="Immutable trail" title="最近审计事件" description="企业对象、权限、分级、评测、复核和连接器操作统一留痕。" /><div className="divide-y divide-white/[0.06]">{snapshot?.audits.slice(0, 30).map((item) => <div key={item.id} className="grid gap-2 px-5 py-3 text-[10px] sm:grid-cols-[1.2fr_1fr_1fr_auto]"><span className="text-cyan-200">{item.action}</span><span className="text-slate-500">{item.resourceType}:{item.resourceId}</span><span className="text-slate-600">{item.caseId || "工作区级"}</span><span className={item.outcome === "success" ? "text-emerald-300" : "text-rose-300"}>{new Date(item.createdAt).toLocaleString("zh-CN")}</span></div>)}</div></Panel></div>}
    {!snapshot && busy !== "load" && <Panel><EmptyStateCard icon={ShieldCheck} title="治理服务尚未连接" description="请确认 FastAPI 服务可用；纯前端模式仍可使用研判功能，但组织权限与审计不会被错误标记为已启用。" /></Panel>}
    {busy && busy !== "load" && <div className="pointer-events-none fixed bottom-6 right-6 flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-[#07111d] px-4 py-3 text-xs text-cyan-100 shadow-2xl"><Loader2 className="h-4 w-4 animate-spin" />正在执行治理操作</div>}
    <EnterpriseDialog open={Boolean(deciding)} onClose={() => setDeciding(null)} title={deciding?.status === "approved" ? "批准复核事项" : "驳回复核事项"} description="复核依据将进入不可篡改留痕；复核人身份由系统记录，无需手填。">
      <form onSubmit={submitDecision} className="space-y-4">
        <label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">{deciding?.status === "approved" ? "批准依据" : "驳回原因"}</span><textarea required rows={3} value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} placeholder="写明对照的证据、规则与结论" className="field-control resize-none" /></label>
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setDeciding(null)} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-400">取消</button><button type="submit" className={`rounded-xl px-4 py-2.5 text-xs font-semibold text-[#041018] ${deciding?.status === "approved" ? "bg-emerald-300" : "bg-rose-300"}`}>{deciding?.status === "approved" ? "确认批准" : "确认驳回"}</button></div>
      </form>
    </EnterpriseDialog>
  </div>;
}
