"use client";

/**
 * Global Detail Drawer：右侧滑出详情，避免频繁整页跳转。
 *
 * 适用于 Project / Document / Risk / Task / Rule / Audit 的快速查看；
 * 支持 Esc 关闭、backdrop 点击关闭、焦点进入（a11y 基线）。
 */
import { type ReactNode, useEffect } from "react";
import { X } from "lucide-react";

export default function DetailDrawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[110] flex justify-end bg-black/60 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex h-full w-full ${width} flex-col border-l border-white/[0.09] bg-elevated shadow-2xl`}
      >
        <div className="flex items-start justify-between border-b border-white/[0.07] px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-white">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate text-[11px] text-slate-500">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" autoFocus className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-white/[0.06] hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </div>
  );
}

/** 详情抽屉内的标准分区标题（What / Why / Evidence / Rule / Impact / Review / Audit）。 */
export function DrawerSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="border-b border-white/[0.05] py-4 first:pt-0 last:border-0">
      <p className="text-[10px] font-semibold uppercase tracking-[.15em] text-slate-600">{label}</p>
      <div className="mt-2 text-xs leading-6 text-slate-300">{children}</div>
    </section>
  );
}
