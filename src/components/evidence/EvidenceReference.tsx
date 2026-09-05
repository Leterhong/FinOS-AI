"use client";

/**
 * Evidence Components：证据引用与证据链。
 *
 * EvidenceReference 展示「来源 / 位置」并支持定位回调；
 * EvidenceChain 以 Conclusion → Fact → Evidence → Source 的固定顺序
 * 渲染追溯链路。数据必须来自真实抽取结果，禁止编造坐标或页码。
 */
import { FileSearch } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EvidenceReferenceProps {
  documentName: string;
  location?: string;
  page?: number;
  line?: number;
  cell?: string;
  sheet?: string;
  onLocate?: () => void;
  className?: string;
}

export function EvidenceReference({ documentName, location, page, line, cell, sheet, onLocate, className }: EvidenceReferenceProps) {
  const locators = [
    location,
    page ? `第 ${page} 页` : undefined,
    line ? `第 ${line} 行` : undefined,
    sheet && cell ? `${sheet}!${cell}` : undefined,
  ].filter(Boolean) as string[];

  return (
    <button
      type="button"
      onClick={onLocate}
      disabled={!onLocate}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-left text-[10px] text-slate-400 transition",
        onLocate ? "hover:border-cyan-400/25 hover:text-cyan-200" : "cursor-default"
      )}
    >
      <FileSearch className="h-3 w-3 shrink-0 text-cyan-300/70" />
      <span className="min-w-0 truncate">
        <span className="text-slate-300">{documentName}</span>
        {locators.length > 0 && <span className="text-slate-600"> · {locators.join(" · ")}</span>}
      </span>
    </button>
  );
}

export interface EvidenceChainStep {
  label: string;
  value: string;
}

/** 固定顺序的追溯链：Conclusion → Fact → Evidence → Source。 */
export function EvidenceChain({ steps, className }: { steps: EvidenceChainStep[]; className?: string }) {
  if (!steps.length) return null;
  return (
    <div className={cn("space-y-0", className)}>
      {steps.map((step, index) => (
        <div key={`${step.label}-${index}`}>
          <div className="flex items-start gap-2.5">
            <span className="mt-1.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-cyan-400/20 bg-cyan-400/[0.05] text-[8px] font-bold text-cyan-300">
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-[.14em] text-slate-600">{step.label}</p>
              <p className="mt-0.5 break-words text-xs leading-5 text-slate-300">{step.value}</p>
            </div>
          </div>
          {index < steps.length - 1 && <div className="ml-2 h-3 w-px bg-white/[0.09]" />}
        </div>
      ))}
    </div>
  );
}
