"use client";

import GlassCard from "../ui/GlassCard";
import { Sparkles, ArrowUpRight } from "lucide-react";

/**
 * AI 智能体网络（Phase 5.9.3 弱化版）。
 * 面向普通用户：不暴露技术细节（不再逐 Agent 展示名称/图标），
 * 仅传达「AI CFO 团队 · 5 个智能顾问协作中」，整卡可点击进入智能体中心。
 */
const ADVISOR_COUNT = 5;

export default function BentoAgents({ delay = 0 }: { delay?: number }) {
  return (
    <GlassCard className="flex h-full flex-col p-6" delay={delay}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand shadow-glow-purple">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-widest text-white/40">
              AI CFO 团队
            </p>
            <h3 className="text-base font-semibold text-white">智能顾问协作中</h3>
          </div>
        </div>
        <ArrowUpRight className="h-4 w-4 text-white/30" />
      </div>

      <div className="mt-5 flex items-center gap-3">
        <div className="flex -space-x-2">
          {Array.from({ length: ADVISOR_COUNT }).map((_, i) => (
            <div
              key={i}
              className="h-8 w-8 rounded-full bg-gradient-to-br from-brand-electric/70 to-brand-purple/70 ring-2 ring-[#0a0a0a]"
            />
          ))}
        </div>
        <p className="text-sm text-white/60">
          {ADVISOR_COUNT} 个智能顾问正在为你工作
        </p>
      </div>

      <p className="mt-auto pt-4 text-[11px] text-white/35">
        点击进入 AI 智能体中心，查看每位顾问的专长 →
      </p>
    </GlassCard>
  );
}
