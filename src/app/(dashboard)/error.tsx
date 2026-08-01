"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, LayoutGrid } from "lucide-react";

/**
 * Dashboard 段错误边界（嵌套在 (dashboard)/layout 内，保留侧边栏与顶栏）。
 * 安全约束：仅向控制台记录完整错误，绝不向用户渲染堆栈或内部路径。
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 仅记录到控制台，避免泄露堆栈 / 内部路径给终端用户
    console.error("Dashboard error:", error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="glass max-w-md w-full rounded-2xl p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-bold text-white">这个页面遇到了异常</h1>
        <p className="mt-2 text-sm text-white/50">
          我们已记录此次错误。你可以重试当前页面，或返回指挥中心继续操作。
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-lg border border-white/12 bg-white/[0.04] px-5 py-2.5 text-sm text-white transition-colors hover:bg-white/[0.08]"
          >
            <RotateCcw className="h-4 w-4" />
            重试
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-semantic-success px-5 py-2.5 text-sm font-semibold text-[#04140e] transition-opacity hover:opacity-90"
          >
            <LayoutGrid className="h-4 w-4" />
            返回指挥中心
          </Link>
        </div>
      </div>
    </div>
  );
}
