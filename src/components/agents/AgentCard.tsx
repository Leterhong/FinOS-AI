"use client";

import { motion } from "framer-motion";
import type { AgentAnalysis } from "@/agents/types";
import AgentAvatar from "./AgentAvatar";
import { Progress } from "../ui/progress";
import { cn } from "@/lib/utils";
import type { AgentKey } from "@/data/types";

const agentNames: Record<AgentKey, string> = {
  planner: "财富规划 Agent",
  cashflow: "现金流分析 Agent",
  investment: "投资规划 Agent",
  risk: "风险评估 Agent",
  retirement: "退休规划 Agent",
  strategy: "财富策略 Agent",
  summary: "综合总结 Agent",
};

interface AgentCardProps {
  analysis: AgentAnalysis;
  delay?: number;
}

const toneColor = {
  good: "text-semantic-success",
  warn: "text-semantic-warn",
  risk: "text-semantic-risk",
};

export default function AgentCard({ analysis, delay = 0 }: AgentCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="glass rounded-2xl p-5"
    >
      <div className="flex items-start gap-4">
        <AgentAvatar agent={analysis.agent} status="done" size="md" />
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-widest text-white/40">
            {agentNames[analysis.agent]}
          </p>
          <h4 className="mt-1 font-semibold text-white">{analysis.headline}</h4>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] text-white/30">置信度</p>
          <p className="text-sm font-bold numeric text-brand-electric">
            {(analysis.confidence * 100).toFixed(0)}%
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {analysis.bullets.slice(0, 3).map((bullet, i) => (
          <p key={i} className="text-xs text-white/50 leading-relaxed flex items-start gap-2">
            <span className="text-brand-electric mt-1">•</span>
            {bullet}
          </p>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {analysis.metrics.slice(0, 4).map((metric, i) => (
          <div key={i} className="rounded-lg bg-white/[0.03] p-2.5">
            <p className="text-[10px] text-white/30 uppercase tracking-wider">{metric.label}</p>
            <p className={cn("text-sm font-semibold numeric mt-0.5", metric.tone ? toneColor[metric.tone] : "text-white")}>
              {metric.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3">
        <Progress
          value={analysis.confidence * 100}
          indicatorClassName="bg-gradient-to-r from-brand-electric to-brand-purple"
        />
      </div>
    </motion.div>
  );
}
