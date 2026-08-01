"use client";

import { useFinancialStore } from "@/store/financial-store";
import GlassCard from "@/components/ui/GlassCard";
import { GitBranch, Flag } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { WealthTimelinePoint } from "@/twin/engine";

const kindMeta: Record<
  string,
  { dot: string; text: string }
> = {
  past: { dot: "bg-white/30", text: "text-white/40" },
  present: { dot: "bg-brand-electric", text: "text-brand-electric" },
  future: { dot: "bg-brand-purple", text: "text-brand-purple" },
  goal: { dot: "bg-emerald-400", text: "text-emerald-300" },
};

/**
 * 人生财富时间线（Phase 5.9.2 第三层卡片）。
 * 基于 Financial Twin 的 timeline 渲染横向人生财富轨迹，按阶段配色：
 *   past（过往）/ present（当下）/ future（未来）/ goal（目标）。
 * 无数据时展示占位，引导完成财富初始化。
 */
export default function BentoLifeTimeline({ delay = 0 }: { delay?: number }) {
  const twinSnapshot = useFinancialStore((s) => s.twinSnapshot);
  const timeline: WealthTimelinePoint[] = twinSnapshot?.timeline ?? [];

  return (
    <GlassCard className="p-6" glow delay={delay}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand shadow-glow-blue">
            <GitBranch className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-widest text-white/40">
              人生财富时间线
            </p>
            <h3 className="text-base font-semibold text-white">你的财富轨迹</h3>
          </div>
        </div>
        <span className="text-[11px] text-white/30">基于 Financial Twin</span>
      </div>

      {timeline.length === 0 ? (
        <div className="mt-6 flex flex-col items-center justify-center rounded-xl bg-white/[0.03] py-8 text-center ring-1 ring-white/10">
          <p className="text-sm text-white/50">完成财富初始化后</p>
          <p className="mt-1 text-xs text-white/35">
            AI 将生成你的人生财富时间线
          </p>
        </div>
      ) : (
        <div className="mt-6 flex items-start justify-between gap-1 overflow-x-auto pb-1">
          {timeline.map((p, i) => {
            const meta = kindMeta[p.kind] ?? kindMeta.future;
            const isLast = i === timeline.length - 1;
            return (
              <div
                key={`${p.year}-${i}`}
                className="relative flex min-w-[84px] flex-1 flex-col items-center"
              >
                {/* 连接线 */}
                {!isLast && (
                  <span className="absolute left-1/2 top-2 h-px w-full bg-white/10" />
                )}
                <div
                  className={`relative z-10 flex h-4 w-4 items-center justify-center rounded-full ${meta.dot}`}
                >
                  {p.kind === "goal" && (
                    <Flag className="h-2.5 w-2.5 text-[#0a0a0a]" />
                  )}
                </div>
                <p className={`mt-2 text-[11px] font-medium ${meta.text}`}>
                  {p.age} 岁
                </p>
                <p className="numeric text-[11px] text-white/60">
                  {formatCurrency(p.assets)}
                </p>
                {p.label && (
                  <p className="mt-0.5 text-center text-[10px] leading-tight text-white/35">
                    {p.label}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
