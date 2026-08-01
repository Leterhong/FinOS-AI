"use client";

import GlassCard from "../ui/GlassCard";
import { Sparkles, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";

interface BentoInsightProps {
  insight: string;
  impact?: string;
  delay?: number;
}

export default function BentoInsight({ insight, impact, delay = 0 }: BentoInsightProps) {
  return (
    <GlassCard className="relative overflow-hidden p-6" interactive glow delay={delay}>
      {/* Animated gradient accent */}
      <motion.div
        className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand-purple/20 blur-3xl"
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -left-5 -bottom-5 h-24 w-24 rounded-full bg-brand-electric/20 blur-3xl"
        animate={{ scale: [1.2, 1, 1.2], opacity: [0.2, 0.4, 0.2] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-brand shadow-glow-purple">
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </div>
          <p className="text-xs uppercase tracking-widest text-white/40">AI 洞察</p>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-white/90">{insight}</p>

        {impact && (
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-semantic-success">{impact}</p>
            <ChevronRight className="h-4 w-4 text-white/30" />
          </div>
        )}
      </div>
    </GlassCard>
  );
}
