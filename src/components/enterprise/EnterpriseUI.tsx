import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RiskLevel } from "@/types/enterprise";

export const riskMeta: Record<RiskLevel, { label: string; className: string; dot: string }> = {
  critical: { label: "重大", className: "border-rose-400/25 bg-rose-400/10 text-rose-300", dot: "bg-rose-400" },
  high: { label: "高", className: "border-orange-400/25 bg-orange-400/10 text-orange-300", dot: "bg-orange-400" },
  medium: { label: "中", className: "border-amber-400/25 bg-amber-400/10 text-amber-300", dot: "bg-amber-400" },
  low: { label: "低", className: "border-emerald-400/25 bg-emerald-400/10 text-emerald-300", dot: "bg-emerald-400" },
};

export function RiskBadge({ level, className }: { level: RiskLevel; className?: string }) {
  const meta = riskMeta[level];
  return <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold", meta.className, className)}><span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />{meta.label}风险</span>;
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0a111c]/82 shadow-[0_20px_60px_rgba(0,0,0,.2)]", className)}>{children}</section>;
}

export function PanelHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-4"><div className="min-w-0">{eyebrow && <p className="mb-1 text-[10px] font-semibold uppercase tracking-[.18em] text-cyan-300/65">{eyebrow}</p>}<h2 className="text-sm font-semibold text-white">{title}</h2>{description && <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>}</div>{action}</div>;
}

export function MetricCard({ label, value, detail, trend = "flat", accent = "cyan" }: { label: string; value: string; detail: string; trend?: "up" | "down" | "flat"; accent?: "cyan" | "emerald" | "amber" | "rose" }) {
  const colors = { cyan: "from-cyan-400/18 text-cyan-300", emerald: "from-emerald-400/18 text-emerald-300", amber: "from-amber-400/18 text-amber-300", rose: "from-rose-400/18 text-rose-300" };
  const Icon = trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  return <div className={cn("relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br to-transparent p-4", colors[accent])}><div className="absolute right-0 top-0 h-20 w-20 rounded-full bg-current opacity-[.035] blur-xl" /><p className="text-xs text-slate-400">{label}</p><div className="mt-3 flex items-end justify-between gap-2"><strong className="numeric text-2xl font-semibold tracking-tight text-white">{value}</strong><span className="mb-0.5 flex items-center gap-1 text-[11px]"><Icon className="h-3 w-3" />{detail}</span></div></div>;
}

export function PageIntro({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <div className="flex flex-col justify-between gap-4 border-b border-white/[0.07] pb-5 md:flex-row md:items-end"><div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[.22em] text-cyan-300/70">{eyebrow}</p><h1 className="text-2xl font-semibold tracking-[-.03em] text-white md:text-[30px]">{title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{description}</p></div>{actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}</div>;
}
