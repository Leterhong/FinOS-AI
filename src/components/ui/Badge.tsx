"use client";

/**
 * FinOS UI 基础组件：Badge（状态徽标）。
 *
 * 语义色调来自 --finos-* 令牌；riskcolor 的五级风险也统一从这里取色，
 * 供 StatusBadge / RiskBadge / 事实与任务状态复用，避免散落的彩色样式。
 */
import { cn } from "@/lib/utils";

export type BadgeTone =
  | "brand"
  | "ai"
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "resolved"
  | "warning"
  | "danger"
  | "neutral";

const toneClasses: Record<BadgeTone, string> = {
  brand: "border-[rgb(25_195_125/0.25)] bg-[rgb(25_195_125/0.1)] text-[rgb(25_195_125/0.9)]",
  ai: "border-[rgb(76_141_255/0.25)] bg-[rgb(76_141_255/0.1)] text-[rgb(76_141_255/0.9)]",
  critical: "border-[rgb(255_77_79/0.25)] bg-[rgb(255_77_79/0.1)] text-[rgb(255_138_140)]",
  high: "border-[rgb(255_122_69/0.25)] bg-[rgb(255_122_69/0.1)] text-[rgb(255_163_122)]",
  medium: "border-[rgb(246_195_68/0.25)] bg-[rgb(246_195_68/0.1)] text-[rgb(248_212_122)]",
  low: "border-[rgb(76_141_255/0.25)] bg-[rgb(76_141_255/0.1)] text-[rgb(138_178_255)]",
  resolved: "border-[rgb(25_195_125/0.25)] bg-[rgb(25_195_125/0.1)] text-emerald-300",
  warning: "border-amber-400/20 bg-amber-400/[0.06] text-amber-200",
  danger: "border-rose-400/20 bg-rose-400/[0.06] text-rose-200",
  neutral: "border-white/[0.08] bg-white/[0.03] text-slate-400",
};

const dotClasses: Record<BadgeTone, string> = {
  brand: "bg-[var(--finos-brand)]",
  ai: "bg-[var(--finos-ai)]",
  critical: "bg-[var(--finos-risk-critical)]",
  high: "bg-[var(--finos-risk-high)]",
  medium: "bg-[var(--finos-risk-medium)]",
  low: "bg-[var(--finos-risk-low)]",
  resolved: "bg-[var(--finos-risk-resolved)]",
  warning: "bg-amber-400",
  danger: "bg-rose-400",
  neutral: "bg-slate-500",
};

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-medium",
        toneClasses[tone],
        className
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dotClasses[tone])} />}
      {children}
    </span>
  );
}
