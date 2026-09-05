"use client";

import { type ReactNode, useEffect } from "react";
import { X } from "lucide-react";

export default function EnterpriseDialog({ open, onClose, title, description, children }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode }) {
  // Esc 关闭：对话框打开期间监听按键，关闭后移除。
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);
  if (!open) return null;
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-white/[0.1] bg-elevated shadow-2xl">
      <div className="flex items-start justify-between border-b border-white/[0.07] px-5 py-4"><div><h2 className="text-sm font-semibold text-white">{title}</h2>{description && <p className="mt-1 text-[11px] text-slate-500">{description}</p>}</div><button type="button" onClick={onClose} aria-label="关闭" autoFocus className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-white/[0.06] hover:text-white"><X className="h-4 w-4" /></button></div>
      <div className="p-5">{children}</div>
    </div>
  </div>;
}
