"use client";

import GlassCard from "../ui/GlassCard";
import HealthRing from "../charts/HealthRing";
import { TrendingUp } from "lucide-react";
import RiskPill from "../ui/RiskPill";

interface BentoHealthProps {
  score: number;
  debtRisk: number;
  investmentRisk: number;
  cashFlowRisk: number;
  delay?: number;
}

export default function BentoHealth({
  score,
  debtRisk,
  investmentRisk,
  cashFlowRisk,
  delay = 0,
}: BentoHealthProps) {
  return (
    <GlassCard className="row-span-2 flex flex-col items-center justify-center p-6" delay={delay}>
      <div className="mb-4 w-full">
        <p className="text-xs uppercase tracking-widest text-white/40">财务健康</p>
      </div>
      <HealthRing score={score} sublabel="优秀" />
      <div className="mt-6 w-full space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-white/40">趋势</span>
          <span className="flex items-center gap-1 text-semantic-success">
            <TrendingUp className="h-3 w-3" />
            本月 +3.2
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <RiskPill score={debtRisk} />
          <RiskPill score={investmentRisk} />
          <RiskPill score={cashFlowRisk} />
        </div>
      </div>
    </GlassCard>
  );
}
