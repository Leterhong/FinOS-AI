"use client";

/**
 * FinOS UI 基础组件：Tooltip。
 *
 * 纻 CSS 实现（group-hover / group-focus-within），无第三方依赖。
 * showOn="lg-hover" 用于侧栏折叠态：小屏不显示（标签可见），折叠后悬停显示。
 */
import { cn } from "@/lib/utils";

export function Tooltip({
  label,
  side = "right",
  showOn = "hover",
  children,
  className,
}: {
  label: string;
  side?: "right" | "top" | "bottom";
  showOn?: "hover" | "lg-hover";
  children: React.ReactNode;
  className?: string;
}) {
  const showClass =
    showOn === "lg-hover"
      ? "hidden lg:group-hover/tt:inline-flex lg:group-focus-within/tt:inline-flex"
      : "group-hover/tt:inline-flex group-focus-within/tt:inline-flex";
  return (
    <span className={cn("group/tt relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-[130] whitespace-nowrap rounded-md border border-white/10 bg-elevated px-2 py-1 text-[10px] text-slate-200 shadow-xl",
          showClass,
          side === "right" && "left-full top-1/2 ml-2 -translate-y-1/2",
          side === "top" && "bottom-full left-1/2 mb-1.5 -translate-x-1/2",
          side === "bottom" && "top-full left-1/2 mt-1.5 -translate-x-1/2"
        )}
      >
        {label}
      </span>
    </span>
  );
}
