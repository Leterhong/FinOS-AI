"use client";

import GlassCard from "../ui/GlassCard";
import { ShieldAlert } from "lucide-react";
import RiskPill from "../ui/RiskPill";
import { Progress } from "../ui/progress";

interface RiskItem {
  label: string;
  score: number;
}

interface BentoRiskProps {
  risks: RiskItem[];
  delay?: number;
}

const riskColor = (score: number) =>
  score < 30 ? "bg-semantic-success" : score < 60 ? "bg-semantic-warn" : "bg-semantic-risk";

export default function BentoRisk({ risks, delay = 0 }: BentoRiskProps) {
  return (
    <GlassCard className="p-6" delay={delay}>
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-white/40">风险监控</p>
        <ShieldAlert className="h-4 w-4 text-semantic-warn" />
      </div>
      <div className="mt-4 space-y-3.5">
        {risks.map((risk) => (
          <div key={risk.label}>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs text-white/60">{risk.label}</span>
              <RiskPill score={risk.score} showValue={false} />
            </div>
            <Progress value={risk.score} indicatorClassName={riskColor(risk.score)} />
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
