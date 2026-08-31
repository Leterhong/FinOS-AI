"use client";

import { FormEvent, useState } from "react";
import { Pencil, Plus, UserRound } from "lucide-react";
import { EmptyStateCard, RiskBadge, PageIntro, Panel } from "@/components/enterprise/EnterpriseUI";
import EnterpriseDialog from "@/components/enterprise/EnterpriseDialog";
import { useEnterpriseStore } from "@/store/enterprise-store";
import type { RiskLevel, WorkflowTask } from "@/types/enterprise";

const stages = ["待处理","处理中","待复核","已完成"] as const;

/** 真实超期判定：due 为日期输入值（YYYY-MM-DD），小于今天且未完成即超期。 */
function isOverdue(due: string, stage: string): boolean {
  if (stage === "已完成" || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return false;
  return due < new Date().toISOString().slice(0, 10);
}

export default function WorkflowsPage() {
  const tasks = useEnterpriseStore((state) => state.tasks);
  const cases = useEnterpriseStore((state) => state.cases);
  const addTask = useEnterpriseStore((state) => state.addTask);
  const advanceTask = useEnterpriseStore((state) => state.advanceTask);
  const updateTask = useEnterpriseStore((state) => state.updateTask);
  const [open,setOpen] = useState(false);
  const [advancing, setAdvancing] = useState<WorkflowTask | null>(null);
  const [editing, setEditing] = useState<WorkflowTask | null>(null);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const caseId = String(data.get("caseId") || "");
    const relatedCase = cases.find((item) => item.id === caseId);
    if (!relatedCase) return;
    addTask({
      title: String(data.get("title")),
      caseId: relatedCase.id,
      caseName: `${relatedCase.company} · ${relatedCase.title}`,
      assignee: String(data.get("assignee")),
      due: String(data.get("due")),
      priority: String(data.get("priority")) as RiskLevel,
      note: String(data.get("note") || "") || undefined,
    });
    setOpen(false);
  };
  const submitAdvance = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!advancing) return;
    const data = new FormData(event.currentTarget);
    advanceTask(advancing.id, String(data.get("actor")), String(data.get("note")));
    setAdvancing(null);
  };
  const submitEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    const data = new FormData(event.currentTarget);
    updateTask(editing.id, {
      title: String(data.get("title")),
      assignee: String(data.get("assignee")),
      due: String(data.get("due")),
      priority: String(data.get("priority")) as RiskLevel,
      stage: String(data.get("stage")) as WorkflowTask["stage"],
    }, String(data.get("actor")), String(data.get("changeNote")));
    setEditing(null);
  };
  return <div className="page-shell"><PageIntro eyebrow="Human-in-the-loop" title="研判流程中心" description="将 Agent 发现转化为明确的补充资料、核验、复核与审批任务，让人机协作真正进入业务流程。" actions={<button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]"><Plus className="h-3.5 w-3.5" />创建任务</button>} />
    {tasks.length === 0 ? <Panel><EmptyStateCard title="还没有人工任务" description="将资料补充、证据核验、规则复核或审批动作登记为任务，让 AI 研判结果进入可追踪的人工流程。" action={<button onClick={() => setOpen(true)} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">创建首个任务</button>} /></Panel> : <div className="grid gap-4 xl:grid-cols-4">{stages.map(stage => <section key={stage} className="rounded-2xl border border-white/[0.08] bg-white/[0.018] p-3"><div className="mb-3 flex items-center justify-between px-1"><h2 className="text-xs font-semibold text-slate-300">{stage}</h2><span className="grid h-5 min-w-5 place-items-center rounded-md bg-white/[0.06] px-1 text-[10px] text-slate-500">{tasks.filter(task=>task.stage===stage).length}</span></div><div className="space-y-3">{tasks.filter(task=>task.stage===stage).map(task => <article key={task.id} className="rounded-xl border border-white/[0.08] bg-[#0a121e] p-3.5 shadow-lg"><div className="flex items-center justify-between"><RiskBadge level={task.priority} /><button onClick={() => setEditing(task)} title="编辑、改派或退回" className="grid h-7 w-7 place-items-center rounded-lg border border-white/[0.07] text-slate-500 hover:text-cyan-300"><Pencil className="h-3 w-3" /></button></div><h3 className="mt-3 text-xs font-medium leading-5 text-slate-200">{task.title}</h3><p className="mt-1.5 text-[10px] text-cyan-300/60">{task.caseName}</p>{task.note && <p className="mt-2 text-[10px] leading-5 text-slate-500">{task.note}</p>}<div className="mt-4 flex items-center justify-between border-t border-white/[0.06] pt-3"><span className="flex items-center gap-1.5 text-[10px] text-slate-500"><UserRound className="h-3 w-3" />{task.assignee}</span><span className={`text-[10px] ${isOverdue(task.due, task.stage) ? "text-rose-300" : "text-slate-600"}`}>{isOverdue(task.due, task.stage) ? `${task.due} · 已超期` : task.due}</span></div><p className="mt-2 text-[9px] text-slate-700">审计事件 {task.history?.length ?? 0} 条 · {task.id}</p>{stage!=="已完成" && <button onClick={()=>setAdvancing(task)} className="mt-3 w-full rounded-lg border border-white/[0.08] py-2 text-[10px] text-slate-400 hover:border-cyan-400/20 hover:text-cyan-300">填写意见并推进</button>}</article>)}</div></section>)}</div>}
    <EnterpriseDialog open={open} onClose={() => setOpen(false)} title="创建人工研判任务"><form onSubmit={submit} className="space-y-4"><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">任务内容</span><input required name="title" placeholder="填写需要人工处理或复核的事项" className="field-control" /></label><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">关联项目</span><select required name="caseId" className="field-control"><option value="">请选择企业项目</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.company} · {item.title}</option>)}</select>{cases.length === 0 && <span className="mt-1 block text-[10px] text-amber-300">还没有项目：请先到项目中心创建</span>}</label><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">负责人</span><input required name="assignee" placeholder="填写任务负责人" className="field-control" /></label><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">截止时间</span><input required type="date" name="due" className="field-control" /></label><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">优先级</span><select name="priority" className="field-control"><option value="medium">中风险</option><option value="high">高风险</option><option value="critical">重大风险</option><option value="low">低风险</option></select></label><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">任务说明（可选）</span><textarea name="note" rows={3} placeholder="说明背景、验收标准或需要核验的证据" className="field-control resize-none" /></label><div className="flex justify-end gap-2"><button type="button" onClick={()=>setOpen(false)} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-400">取消</button><button type="submit" disabled={cases.length === 0} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018] disabled:opacity-40">创建任务</button></div></form></EnterpriseDialog>
    <EnterpriseDialog open={Boolean(advancing)} onClose={() => setAdvancing(null)} title="推进人工任务" description={advancing ? `${advancing.stage} · ${advancing.title}` : undefined}><form onSubmit={submitAdvance} className="space-y-4"><div className="rounded-xl border border-white/[0.07] p-3 text-[10px] text-slate-500">每次推进都会保存操作人、意见、原阶段、目标阶段和时间，作为项目审计摘要的一部分。</div><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">操作人</span><input required name="actor" defaultValue={advancing?.assignee} className="field-control" /></label><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">处理意见</span><textarea required name="note" rows={4} placeholder="记录已完成动作、核验依据或需要下阶段关注的问题" className="field-control resize-none" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setAdvancing(null)} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-400">取消</button><button type="submit" className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">保存并推进</button></div></form></EnterpriseDialog>
    <EnterpriseDialog open={Boolean(editing)} onClose={() => setEditing(null)} title="编辑、改派或调整阶段" description={editing?.caseName}><form onSubmit={submitEdit} className="space-y-4"><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">任务内容</span><input required name="title" defaultValue={editing?.title} className="field-control" /></label><div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">负责人</span><input required name="assignee" defaultValue={editing?.assignee} className="field-control" /></label><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">截止时间</span><input required type="date" name="due" defaultValue={editing?.due} className="field-control" /></label><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">优先级</span><select name="priority" defaultValue={editing?.priority} className="field-control"><option value="low">低风险</option><option value="medium">中风险</option><option value="high">高风险</option><option value="critical">重大风险</option></select></label><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">任务阶段</span><select name="stage" defaultValue={editing?.stage} className="field-control">{stages.map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select></label></div><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">操作人</span><input required name="actor" defaultValue={editing?.assignee} className="field-control" /></label><label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">变更原因</span><textarea required name="changeNote" rows={3} placeholder="记录改派、延期、退回或调整阶段的原因" className="field-control resize-none" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-400">取消</button><button type="submit" className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">保存变更</button></div></form></EnterpriseDialog>
  </div>;
}
