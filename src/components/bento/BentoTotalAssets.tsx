"use client";

import GlassCard from "../ui/GlassCard";
import StatNumber from "../ui/StatNumber";
import { Wallet } from "lucide-react";

interface BentoTotalAssetsProps {
  totalAssets: number;
  netWorth: number;
  delay?: number;
}

export default function BentoTotalAssets({
  totalAssets,
  netWorth,
  delay = 0,
}: BentoTotalAssetsProps) {
  return (
    <GlassCard className="flex flex-col justify-between p-6" interactive delay={delay}>
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-white/40">总资产</p>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-electric/15">
          <Wallet className="h-4 w-4 text-brand-electric" />
        </div>
      </div>
      <div className="mt-4">
        <div className="text-3xl font-bold tracking-tight">
          <StatNumber value={totalAssets} prefix="¥" currency duration={1.6} />
        </div>
        <p className="mt-1 text-xs text-white/40">
          净资产：<span className="numeric text-white/70">¥{Math.round(netWorth).toLocaleString("zh-CN")}</span>
        </p>
      </div>
    </GlassCard>
  );
}
