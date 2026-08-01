"use client";

import GlassCard from "../ui/GlassCard";
import ProjectionCurve from "../charts/ProjectionCurve";
import type { ProjectionPoint } from "@/data/types";
import { TrendingUp, Sparkles } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useFinancialStore } from "@/store/financial-store";
import type { WealthTimelinePoint } from "@/twin/engine";

interface BentoProjectionProps {
  data: ProjectionPoint[];
  retirementAge: number;
  targetAmount: number;
  delay?: number;
}

/**
 * Financial Twin · 你的财富未来模拟（Phase 5.9.3 升级版「财富轨迹」）。
 * 在预测曲线之外，补充「当前状态 / 未来预测 / 关键人生节点」三大语义块，
 * 让用户直观理解 AI 正在基于真实数据模拟其人生财富轨迹。
 */
export default function BentoProjection({
  data,
  retirementAge,
  targetAmount,
  delay = 0,
}: BentoProjectionProps) {
  const twinSnapshot = useFinancialStore((s) => s.twinSnapshot);
  const finalProjection = data[data.length - 1];
  const retirementProjection = data.find((d) => d.age === retirementAge);

  const currentAssets = twinSnapshot?.netWorth ?? finalProjection?.assets ?? 0;
  const onTrack = twinSnapshot?.onTrack ?? false;

  // 关键人生节点：取 present（当下）+ goal（目标）两类里程碑，最多 3 个
  const timeline: WealthTimelinePoint[] = twinSnapshot?.timeline ?? [];
  const milestones = timeline
    .filter((p) => p.kind === "present" || p.kind === "goal")
    .slice(0, 3);

  return (
    <GlassCard className="flex flex-col p-6" glow delay={delay}>
      <div className="mb-3 flex items-start justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-white/40">Financial Twin</p>
          <h3 className="mt-1 text-lg font-semibold text-white">你的财富未来模拟</h3>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-white/40">
            <Sparkles className="h-3 w-3 text-brand-purple" />
            AI 正在基于你的真实数据模拟人生财富轨迹
          </p>
        </div>
        <div
          className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] ${
            onTrack
              ? "bg-emerald-400/15 text-emerald-300"
              : "bg-amber-400/15 text-amber-300"
          }`}
        >
          <TrendingUp className="h-3 w-3" />
          {onTrack ? "AI 模拟达标" : "正在追赶目标"}
        </div>
      </div>

      <div className="flex-1">
        <ProjectionCurve
          data={data}
          retirementAge={retirementAge}
          targetAmount={targetAmount}
          height={200}
        />
      </div>

      {/* 当前状态 / 未来预测 / 关键人生节点 */}
      <div className="mt-4 grid grid-cols-3 gap-4 border-t border-white/8 pt-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/30">当前状态</p>
          <p className="text-sm font-bold numeric text-white">
            {formatCurrency(currentAssets)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/30">
            {retirementAge} 岁预测
          </p>
          <p className="text-sm font-bold numeric text-brand-electric">
            {retirementProjection ? formatCurrency(retirementProjection.assets) : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/30">目标</p>
          <p className="text-sm font-bold numeric text-semantic-warn">
            {formatCurrency(targetAmount)}
          </p>
        </div>
      </div>

      {/* 关键人生节点 */}
      {milestones.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {milestones.map((m) => (
            <span
              key={`${m.age}-${m.label}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/55 ring-1 ring-white/10"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  m.kind === "goal" ? "bg-emerald-400" : "bg-brand-electric"
                }`}
              />
              {m.age} 岁 · {m.label}
            </span>
          ))}
        </div>
      )}
    </GlassCard>
  );
}
