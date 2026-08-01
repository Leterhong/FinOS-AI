"use client";

import { motion } from "framer-motion";
import { useFinancialStore } from "@/store/financial-store";
import GlassCard from "@/components/ui/GlassCard";
import { GitBranch, Sparkles } from "lucide-react";

/** Dashboard Personal Financial Twin Card（Phase 3.5）：我的财富状态 / 人生阶段 / 未来轨迹 / AI 建议。 */
export default function BentoTwin({ delay = 0 }: { delay?: number }) {
  const profile = useFinancialStore((s) => s.profile);
  const lifeStage = useFinancialStore((s) => s.lifeStage);
  const health = useFinancialStore((s) => s.wealthHealthScore);
  const twin = useFinancialStore((s) => s.twinSnapshot);
  const advisorAlerts = useFinancialStore((s) => s.advisorAlerts);

  const aiAdvice =
    twin?.insight ??
    advisorAlerts[0]?.message ??
    "完成初始化后，我会为你持续提供财富建议。";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <GlassCard className="relative overflow-hidden p-5 h-full" glow>
        <div className="flex items-center gap-3 mb-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-brand shadow-glow-blue">
            <GitBranch className="h-5 w-5 text-white" />
          </span>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/40">
              Personal Financial Twin
            </p>
            <h3 className="text-base font-bold text-white">
              {profile.name} 的财富分身
            </h3>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Stat label="人生阶段" value={lifeStage || "—"} />
          <Stat
            label="财富健康分"
            value={health ? `${health.total}` : "—"}
            sub={health?.grade}
          />
        </div>

        <div className="mt-3 rounded-xl bg-brand-purple/10 p-3 ring-1 ring-brand-purple/20">
          <div className="flex items-center gap-1.5 text-[11px] text-brand-purple mb-1">
            <Sparkles className="h-3 w-3" /> AI 建议
          </div>
          <p className="text-xs text-white/70 leading-relaxed">{aiAdvice}</p>
        </div>
      </GlassCard>
    </motion.div>
  );
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
      <div className="text-[11px] text-white/40">{label}</div>
      <div className="text-lg font-bold text-white">{value}</div>
      {sub && <div className="text-[11px] text-brand-electric">{sub}</div>}
    </div>
  );
}
