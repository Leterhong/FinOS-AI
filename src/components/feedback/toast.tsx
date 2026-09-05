"use client";

/**
 * 统一通知系统（feedback 层）。
 *
 * 五种语义：success / info / warning / error / processing。
 * 重要操作（模型测试、资料上传、Agent 运行、规则测试、项目保存）完成后
 * 必须给出明确反馈；处理中通知不自动消失，由调用方手动关闭或替换。
 */
import { create } from "zustand";
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastTone = "success" | "info" | "warning" | "error" | "processing";

export interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
  /** processing 类通知不自动消失（由调用方 push 同 id 的新通知替换）。 */
  sticky?: boolean;
}

interface ToastState {
  toasts: ToastItem[];
  push: (tone: ToastTone, message: string, options?: { sticky?: boolean }) => number;
  dismiss: (id: number) => void;
}

let nextToastId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (tone, message, options) => {
    const id = nextToastId++;
    const sticky = options?.sticky ?? tone === "processing";
    set((state) => ({ toasts: [...state.toasts.slice(-4), { id, tone, message, sticky }] }));
    if (!sticky) {
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) }));
      }, 4500);
    }
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) })),
}));

/** 便捷 API：toast.success("...") / toast.processing("...", { sticky: true })。 */
export const toast = {
  success: (message: string) => useToastStore.getState().push("success", message),
  info: (message: string) => useToastStore.getState().push("info", message),
  warning: (message: string) => useToastStore.getState().push("warning", message),
  error: (message: string) => useToastStore.getState().push("error", message),
  processing: (message: string) =>
    useToastStore.getState().push("processing", message, { sticky: true }),
  dismiss: (id: number) => useToastStore.getState().dismiss(id),
};

const toneMeta = {
  success: { icon: CheckCircle2, className: "border-emerald-400/25 bg-[#0E1B14]/95 text-emerald-200" },
  info: { icon: Info, className: "border-intel/25 bg-[#0C1424]/95 text-intel" },
  warning: { icon: AlertTriangle, className: "border-amber-400/25 bg-[#1D1809]/95 text-amber-200" },
  error: { icon: XCircle, className: "border-rose-400/25 bg-[#1D0C0E]/95 text-rose-200" },
  processing: { icon: Loader2, className: "border-intel/25 bg-[#0C1424]/95 text-slate-200" },
} as const;

export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[200] flex w-full max-w-sm flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((item) => {
        const meta = toneMeta[item.tone];
        const Icon = meta.icon;
        return (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto flex items-start gap-2.5 rounded-xl border px-4 py-3 text-xs shadow-2xl backdrop-blur",
              meta.className
            )}
          >
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", item.tone === "processing" && "animate-spin")} aria-hidden />
            <p className="min-w-0 flex-1 leading-5">{item.message}</p>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label="关闭通知"
              className="shrink-0 opacity-50 transition hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
