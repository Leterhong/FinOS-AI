import { Skeleton } from "@/components/ui/skeleton";

/**
 * 页面级骨架屏（Phase 7.0.4 #306）。
 * 用于替换各页面自绘的 spinner / loading 分支，统一暗色玻璃风加载态。
 */

/** Dashboard：模拟三层 Bento 网格布局（健康 · 资产/现金流 · 投影 · 简报 · 时间线 …）。 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      {/* 个人欢迎区 */}
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-7 w-28 rounded-full" />
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-24 rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </div>

      {/* 三层 Bento Grid */}
      <div className="grid grid-cols-12 gap-5 auto-rows-[minmax(170px,auto)]">
        <Skeleton className="col-span-12 h-44 rounded-2xl md:col-span-3" />
        <div className="col-span-12 flex flex-col gap-5 md:col-span-3">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
        </div>
        <Skeleton className="col-span-12 h-[340px] rounded-2xl md:col-span-6" />
        <Skeleton className="col-span-12 h-48 rounded-2xl md:col-span-6" />
        <Skeleton className="col-span-12 h-48 rounded-2xl md:col-span-3" />
        <Skeleton className="col-span-12 h-48 rounded-2xl md:col-span-3" />
        <Skeleton className="col-span-12 h-56 rounded-2xl md:col-span-8" />
        <Skeleton className="col-span-12 h-56 rounded-2xl md:col-span-4" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="col-span-12 h-32 rounded-2xl md:col-span-3" />
        ))}
      </div>
    </div>
  );
}

/** Twin：顶部指标行 + 大图表区块 + 右侧控制栏。 */
export function TwinSkeleton() {
  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-9 w-28 rounded-full" />
      </div>

      <div className="grid grid-cols-12 gap-6">
        <Skeleton className="col-span-12 h-[420px] rounded-2xl md:col-span-7" />
        <div className="col-span-12 space-y-5 md:col-span-5">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-12 rounded-2xl" />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <Skeleton className="col-span-12 h-56 rounded-2xl md:col-span-7" />
        <Skeleton className="col-span-12 h-56 rounded-2xl md:col-span-5" />
      </div>
    </div>
  );
}

/** Chat：消息列表 + 输入框。 */
export function ChatSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 pb-4">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="flex-1 space-y-6 overflow-hidden">
        <div className="flex flex-row-reverse gap-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-16 w-2/3 rounded-2xl" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-24 w-3/4 rounded-2xl" />
        </div>
        <div className="flex flex-row-reverse gap-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-12 w-1/2 rounded-2xl" />
        </div>
      </div>

      <div className="pt-3">
        <Skeleton className="h-14 w-full rounded-2xl" />
      </div>
    </div>
  );
}
