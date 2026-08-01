"use client";

import { useFinancialStore } from "@/store/financial-store";
import GlassCard from "@/components/ui/GlassCard";
import { Target, CheckCircle2, AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { GoalStatus } from "@/ai/monitoring/types";

const statusMeta: Record<
  GoalStatus,
  { text: string; bar: string; icon: React.ReactNode }
> = {
  "on-track": {
    text: "text-emerald-300",
    bar: "bg-emerald-400",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  achieved: {
    text: "text-emerald-300",
    bar: "bg-emerald-400",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  "at-risk": {
    text: "text-amber-300",
    bar: "bg-amber-400",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  delayed: {
    text: "text-rose-300",
    bar: "bg-rose-400",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
};

/**
 * 目标进度（Phase 5.9.2 第二层卡片）。
 * 优先展示 Monitor 生成的 goalProgress（多目标），无数据时兜底计算「退休目标」完成度。
 * 始终填充内容，避免大面积空白。
 */
export default function BentoGoalProgress({ delay = 0 }: { delay?: number }) {
  const goalProgress = useFinancialStore((s) => s.goalProgress);
  const monitoring = useFinancialStore((s) => s.monitoring);
  const twinSnapshot = useFinancialStore((s) => s.twinSnapshot);
  const profile = useFinancialStore((s) => s.profile);
  const netWorth = useFinancialStore((s) => s.netWorth);

  const goals = monitoring?.goalProgress ?? goalProgress ?? [];

  const target = profile.goal.targetAmount;
  const current = netWorth || twinSnapshot?.netWorth || 0;
  const retirePct =
    target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const onTrack = twinSnapshot?.onTrack ?? false;

  return (
    <GlassCard className="p-6" delay={delay}>
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-white/40">目标进度</p>
        <Target className="h-4 w-4 text-brand-electric" />
      </div>

      {/* 退休目标概要（始终展示） */}
      <div className="mt-3 flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2 ring-1 ring-white/10">
        <div>
          <p className="text-[11px] text-white/40">退休目标</p>
          <p className="text-sm font-semibold text-white">
            {profile.goal.retirementAge} 岁 · {formatCurrency(target)}
          </p>
        </div>
        <span
          className={`text-xs font-medium ${
            onTrack ? "text-emerald-300" : "text-amber-300"
          }`}
        >
          {onTrack ? "按期达标" : "追赶中"}
        </span>
      </div>

      {/* 多目标进度（来自 Monitor） */}
      {goals.length > 0 ? (
        <div className="mt-3 space-y-2.5">
          {goals.slice(0, 3).map((g) => {
            const meta = statusMeta[g.status] ?? statusMeta["at-risk"];
            return (
              <div key={g.id}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-white/70">
                    {meta.icon}
                    {g.label}
                  </span>
                  <span className={meta.text}>{g.progressPct}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-white/10">
                  <div
                    className={`h-1.5 rounded-full ${meta.bar}`}
                    style={{ width: `${Math.min(100, g.progressPct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-3">
          <div className="h-2 w-full rounded-full bg-white/10">
            <div
              className={`h-2 rounded-full ${
                onTrack ? "bg-emerald-400" : "bg-amber-400"
              }`}
              style={{ width: `${retirePct}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-white/40">
            已积累 {formatCurrency(current)} · 完成度 {retirePct}%
          </p>
        </div>
      )}

      {goals.length === 0 && (
        <p className="mt-3 text-[11px] text-white/30">
          运行 AI 分析可获得更精准的多目标追踪。
        </p>
      )}
    </GlassCard>
  );
}
