"use client";

import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import type { AgentResult } from "@/data/types";
import { cn } from "@/lib/utils";

const agentLabels: Record<string, string> = {
  planner: "财富规划 Agent",
  cashflow: "现金流分析 Agent",
  investment: "投资规划 Agent",
  risk: "风险评估 Agent",
  retirement: "退休规划 Agent",
  strategy: "财富策略 Agent",
  summary: "综合总结 Agent",
};

interface AgentStepIndicatorProps {
  steps: AgentResult[];
}

export default function AgentStepIndicator({ steps }: AgentStepIndicatorProps) {
  const anyActive = steps.some((s) => s.status !== "idle");
  if (!anyActive) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {steps.map((step) => {
        if (step.status === "idle") return null;

        return (
          <motion.div
            key={step.agent}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn(
              "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs",
              step.status === "done"
                ? "bg-semantic-success/10 text-semantic-success border border-semantic-success/20"
                : "bg-brand-electric/10 text-brand-electric border border-brand-electric/20"
            )}
          >
            {step.status === "done" ? (
              <Check className="h-3 w-3" />
            ) : (
              <Loader2 className="h-3 w-3 animate-spin" />
            )}
            {agentLabels[step.agent]}
            {step.status === "done" && <span className="text-[10px] opacity-70">✓</span>}
          </motion.div>
        );
      })}
    </div>
  );
}
