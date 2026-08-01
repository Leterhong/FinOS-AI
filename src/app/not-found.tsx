import Link from "next/link";
import { Compass, ArrowLeft } from "lucide-react";

/**
 * 全局 404 页面。
 * 未命中任何路由时展示，避免落到 Next.js 默认页导致视觉断层。
 */
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0e14] px-6">
      <div className="w-full max-w-md rounded-2xl border border-white/[0.08] bg-white/[0.04] p-8 text-center backdrop-blur-xl">
        <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#00D68F]/10 text-[#00D68F]">
          <Compass className="h-6 w-6" />
        </div>

        <p className="mb-1 text-4xl font-bold tracking-tight text-white/90">404</p>
        <h1 className="mb-2 text-lg font-semibold text-white">这个页面不存在</h1>
        <p className="mb-7 text-sm leading-relaxed text-white/50">
          链接可能已经失效，或者地址输入有误。你的财富数据不受影响。
        </p>

        <div className="flex justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-[10px] bg-[#00D68F] px-5 py-2.5 text-sm font-semibold text-[#04140e] transition-opacity hover:opacity-90"
          >
            <ArrowLeft className="h-4 w-4" />
            返回财富总览
          </Link>
          <Link
            href="/assistant"
            className="inline-flex items-center rounded-[10px] border border-white/[0.12] bg-white/[0.04] px-5 py-2.5 text-sm text-white transition-colors hover:bg-white/[0.08]"
          >
            问问 AI 助手
          </Link>
        </div>
      </div>
    </div>
  );
}
