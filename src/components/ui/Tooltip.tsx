"use client";

/**
 * FinOS UI 基础组件：Tooltip。
 *
 * 通过 Portal 渲染到 body 并使用 fixed 定位，避免被父级 overflow-hidden 或
 * 折叠侧栏边界裁切。showOn="lg-hover" 用于侧栏折叠态：小屏不显示。
 */
import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type Side = "right" | "top" | "bottom";

export function Tooltip({
  label,
  side = "right",
  showOn = "hover",
  children,
  className,
}: {
  label: string;
  side?: Side;
  showOn?: "hover" | "lg-hover";
  children: ReactNode;
  className?: string;
}) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; transform: string } | null>(null);

  const compute = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 8;
    if (side === "top") {
      setPos({ top: rect.top - gap, left: rect.left + rect.width / 2, transform: "translate(-50%,-100%)" });
    } else if (side === "bottom") {
      setPos({ top: rect.bottom + gap, left: rect.left + rect.width / 2, transform: "translate(-50%,0)" });
    } else {
      setPos({ top: rect.top + rect.height / 2, left: rect.right + gap, transform: "translateY(-50%)" });
    }
  };
  const hide = () => setPos(null);
  const isLg = () => typeof window !== "undefined" && window.matchMedia("(min-width:1024px)").matches;
  const onEnter = () => { if (showOn !== "lg-hover" || isLg()) compute(); };

  return (
    <>
      <span
        ref={triggerRef}
        className={cn("inline-flex", className)}
        onMouseEnter={onEnter}
        onMouseLeave={hide}
        onFocus={onEnter}
        onBlur={hide}
      >
        {children}
      </span>
      {pos && typeof document !== "undefined" && createPortal(
        <span
          role="tooltip"
          style={{ position: "fixed", top: pos.top, left: pos.left, transform: pos.transform }}
          className="pointer-events-none z-[130] whitespace-nowrap rounded-md border border-white/10 bg-elevated px-2 py-1 text-[10px] text-slate-200 shadow-xl"
        >
          {label}
        </span>,
        document.body,
      )}
    </>
  );
}
