"use client";

import { type FormEvent, useMemo, useState } from "react";
import { Filter, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmptyStateCard, PageIntro, Panel, RiskBadge } from "@/components/enterprise/EnterpriseUI";
import EnterpriseDialog from "@/components/enterprise/EnterpriseDialog";
import { LayoutGrid, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEnterpriseStore } from "@/store/enterprise-store";
import { EnterpriseDataTable, type DataTableColumn } from "@/components/data-display/EnterpriseDataTable";

export default function CasesPage() {
  const router = useRouter();
  const items = useEnterpriseStore((state) => state.cases);
  const createCase = useEnterpriseStore((state) => state.createCase);
  const [risk, setRisk] = useState("全部");
  const [createOpen, setCreateOpen] = useState(false);
  const [view, setView] = useState<"table" | "board">("table");
  const cases = useMemo(
    () => items.filter((item) => risk === "全部" || item.risk === risk),
    [items, risk],
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const item = createCase({ company: String(data.get("company")), title: String(data.get("title")), industry: String(data.get("industry")), amount: String(data.get("amount")), owner: String(data.get("owner")) });
    setCreateOpen(false);
    router.push(`/cases/${encodeURIComponent(item.id)}`);
  };

  return <div className="page-shell">
    <PageIntro eyebrow="Case management" title="企业项目中心" description="围绕一个融资、尽调或经营分析任务集中管理资料、规则、风险、结论和流程。" actions={<button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]"><Plus className="h-3.5 w-3.5" />新建项目</button>} />
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="flex flex-1 items-center gap-1 overflow-x-auto rounded-xl border border-white/[0.08] bg-white/[0.025] p-1"><Filter className="ml-2 h-3.5 w-3.5 shrink-0 text-slate-600" />{[["全部", "全部"], ["重大", "critical"], ["高风险", "high"], ["中风险", "medium"], ["低风险", "low"]].map(([label, value]) => <button key={value} onClick={() => setRisk(value)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-[11px] ${risk === value ? "bg-white/[0.09] text-white" : "text-slate-500 hover:text-slate-300"}`}>{label}</button>)}</div>
      <div className="flex items-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.025] p-1">
        <button type="button" onClick={() => setView("table")} aria-label="表格视图" className={cn("flex h-8 w-8 items-center justify-center rounded-lg transition", view === "table" ? "bg-white/[0.09] text-white" : "text-slate-500 hover:text-slate-300")}><Table2 className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={() => setView("board")} aria-label="看板视图" className={cn("flex h-8 w-8 items-center justify-center rounded-lg transition", view === "board" ? "bg-white/[0.09] text-white" : "text-slate-500 hover:text-slate-300")}><LayoutGrid className="h-3.5 w-3.5" /></button>
      </div>
    </div>
    {view === "board" && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {(["研判中", "待复核", "已完成"] as const).map((status) => {
        const columnCases = cases.filter((item) => !item.archivedAt && item.status === status);
        return <section key={status} className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3">
          <div className="flex items-center justify-between px-1 pb-2"><h2 className="text-xs font-semibold text-slate-300">{status}</h2><span className="rounded-md bg-white/[0.06] px-1.5 text-[10px] text-slate-500">{columnCases.length}</span></div>
          <div className="space-y-2">{columnCases.map((item) => <Link key={item.id} href={`/cases/${encodeURIComponent(item.id)}`} className="block rounded-lg border border-white/[0.06] bg-[#0a111c] p-3 transition hover:border-cyan-400/25"><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-medium text-slate-200">{item.company}</p><RiskBadge level={item.risk} /></div><p className="mt-1.5 truncate text-[10px] text-slate-500">{item.title}</p><div className="mt-2.5 flex justify-between text-[10px] text-slate-600"><span>{item.owner || "待指派"}</span><span className="numeric">{item.progress}%</span></div><div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-wealth" style={{ width: `${item.progress}%` }} /></div></Link>)}
          {columnCases.length === 0 && <p className="px-1 py-4 text-center text-[10px] text-slate-700">空</p>}
          </div>
        </section>;
      })}
      {cases.filter((item) => !item.archivedAt && item.status === "资料补充").length > 0 && <section className="rounded-xl border border-white/[0.07] bg-white/[0.015] p-3"><div className="flex items-center justify-between px-1 pb-2"><h2 className="text-xs font-semibold text-slate-300">资料补充</h2><span className="rounded-md bg-white/[0.06] px-1.5 text-[10px] text-slate-500">{cases.filter((item) => !item.archivedAt && item.status === "资料补充").length}</span></div>{cases.filter((item) => !item.archivedAt && item.status === "资料补充").map((item) => <Link key={item.id} href={`/cases/${encodeURIComponent(item.id)}`} className="block rounded-lg border border-white/[0.06] bg-[#0a111c] p-3 text-xs text-slate-300">{item.company}</Link>)}</section>}
    </div>}

    {view === "table" && <Panel>
      <EnterpriseDataTable
        rows={cases}
        rowKey={(row) => row.id}
        pageSize={10}
        emptyTitle={items.length === 0 ? "还没有企业项目" : "没有匹配的项目"}
        emptyDescription={items.length === 0
          ? "从一个真实的企业经营、融资或风险研判任务开始，工作区不会自动填充任何示例数据。"
          : "请调整搜索词或风险筛选条件。"}
        toolbar={<button onClick={() => setCreateOpen(true)} className="rounded-lg border border-cyan-400/20 bg-cyan-400/[0.06] px-2.5 py-1 text-[10px] text-cyan-200 transition hover:bg-cyan-400/[0.12]"><Plus className="mr-1 inline h-3 w-3" />新建项目</button>}
        onRowClick={(row) => router.push(`/cases/${encodeURIComponent(row.id)}`)}
        columns={[
          {
            key: "company",
            header: "企业 / 项目",
            sortValue: (row) => `${row.company} ${row.title}`,
            className: "min-w-[16rem]",
            render: (row) => (
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium text-slate-100">{row.company}</span>
                  <RiskBadge level={row.risk} />
                  <span className="rounded-md bg-white/[0.045] px-2 py-1 text-[10px] text-slate-500">{row.archivedAt ? "已归档" : row.status}</span>
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">{row.title} · {row.industry}</p>
                <p className="mt-1 text-[10px] text-slate-600">下一步：{row.nextAction}</p>
              </div>
            ),
          },
          {
            key: "amount",
            header: "融资金额",
            sortValue: (row) => row.amount,
            render: (row) => (
              <div>
                <p className="numeric text-sm text-slate-200">{row.amount}</p>
                <p className="mt-1 text-[10px] text-slate-600">{row.id}</p>
              </div>
            ),
          },
          {
            key: "progress",
            header: "进度",
            sortValue: (row) => row.progress,
            render: (row) => (
              <div>
                <div className="flex justify-between text-[10px] text-slate-500"><span>研判完整度</span><span>{row.progress}%</span></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                  <div className="h-full rounded-full bg-wealth" style={{ width: `${row.progress}%` }} />
                </div>
              </div>
            ),
          },
          {
            key: "owner",
            header: "负责人",
            render: (row) => <span className="text-xs text-slate-400">{row.owner}</span>,
          },
        ]}
      />
    </Panel>}
    <EnterpriseDialog open={createOpen} onClose={() => setCreateOpen(false)} title="新建企业研判项目" description="创建后进入项目工作台；请先配置模型，再上传资料进行 AI 研判">
      <form onSubmit={submit} className="space-y-4">{[["company", "企业名称", "填写企业全称"], ["title", "研判任务", "填写本次研判目标"], ["industry", "所属行业", "填写企业所属行业"], ["amount", "融资金额", "填写金额或注明不适用"], ["owner", "负责人", "填写项目负责人"]].map(([name, label, placeholder]) => <label key={name} className="block"><span className="mb-1.5 block text-[11px] text-slate-400">{label}</span><input required name={name} placeholder={placeholder} className="field-control" /></label>)}<div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setCreateOpen(false)} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-400">取消</button><button type="submit" className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]">创建并进入研判</button></div></form>
    </EnterpriseDialog>
  </div>;
}
