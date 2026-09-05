"use client";

import { BriefcaseBusiness, ShieldCheck } from "lucide-react";
import type { EnterpriseCase } from "@/types/enterprise";

export default function CaseContextSelector({
  cases,
  value,
  onChange,
  detail,
}: {
  cases: EnterpriseCase[];
  value: string;
  onChange: (id: string) => void;
  detail?: string;
}) {
  if (!cases.length) return null;
  const active = cases.find((item) => item.id === value) ?? cases[0];
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.045] p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-400/15 bg-cyan-400/[0.07]">
          <BriefcaseBusiness className="h-4 w-4 text-cyan-300" />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-cyan-300/70">当前项目上下文</p>
          <p className="mt-1 truncate text-xs text-slate-300">{active.company} · {active.title}</p>
          {detail && <p className="mt-1 text-[10px] text-slate-500">{detail}</p>}
        </div>
      </div>
      <label className="block min-w-0 sm:w-80">
        <span className="sr-only">切换当前研判项目</span>
        <select
          aria-label="切换当前研判项目"
          value={active.id}
          onChange={(event) => onChange(event.target.value)}
          className="field-control"
        >
          {cases.map((item) => <option key={item.id} value={item.id}>{item.company} · {item.title}</option>)}
        </select>
      </label>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[10px] text-emerald-300/80">
        <ShieldCheck className="h-3.5 w-3.5" />上下文已隔离
      </span>
    </section>
  );
}
