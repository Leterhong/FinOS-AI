"use client";

import { motion } from "framer-motion";
import {
  Wallet,
  TrendingUp,
  ShieldAlert,
  Clock,
  Sparkles,
  Check,
  Brain,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentKey } from "@/data/types";

const agentConfig: Record<
  AgentKey,
  { name: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  planner: { name: "财富规划 Agent", icon: Brain, color: "from-brand-purple to-emerald-400" },
  cashflow: { name: "现金流分析 Agent", icon: Wallet, color: "from-brand-electric to-blue-400" },
  investment: { name: "投资规划 Agent", icon: TrendingUp, color: "from-brand-purple to-teal-400" },
  risk: { name: "风险评估 Agent", icon: ShieldAlert, color: "from-semantic-warn to-amber-400" },
  retirement: { name: "退休规划 Agent", icon: Clock, color: "from-semantic-success to-emerald-400" },
  strategy: { name: "财富策略 Agent", icon: Target, color: "from-brand-electric to-brand-purple" },
  summary: { name: "综合总结 Agent", icon: Sparkles, color: "from-brand-purple to-emerald-400" },
};

interface AgentAvatarProps {
  agent: AgentKey;
  status: "idle" | "thinking" | "done";
  size?: "sm" | "md" | "lg";
  showName?: boolean;
}

const sizeMap = {
  sm: { box: "h-10 w-10", icon: "h-4 w-4", name: "text-xs" },
  md: { box: "h-14 w-14", icon: "h-6 w-6", name: "text-sm" },
  lg: { box: "h-20 w-20", icon: "h-8 w-8", name: "text-base" },
};

export default function AgentAvatar({
  agent,
  status,
  size = "md",
  showName = false,
}: AgentAvatarProps) {
  const config = agentConfig[agent];
  const Icon = config.icon;
  const sz = sizeMap[size];

  return (
    <div className="flex flex-col items-center gap-2">
      <motion.div
        className={cn(
          "relative flex items-center justify-center rounded-2xl border",
          sz.box,
          status === "idle" && "bg-white/[0.03] border-white/5 grayscale opacity-50",
          status === "thinking" && "bg-white/[0.06] border-brand-electric/30",
          status === "done" && "bg-white/[0.06] border-semantic-success/30"
        )}
        animate={
          status === "thinking"
            ? {
                scale: [1, 1.05, 1],
                boxShadow: [
                  "0 0 20px rgba(14,165,233,0.2)",
                  "0 0 40px rgba(14,165,233,0.4)",
                  "0 0 20px rgba(14,165,233,0.2)",
                ],
              }
            : status === "done"
            ? {
                boxShadow: "0 0 20px rgba(0,214,143,0.2)",
              }
            : {}
        }
        transition={
          status === "thinking"
            ? { duration: 1.5, repeat: Infinity, ease: "easeInOut" }
            : {}
        }
      >
        {/* Gradient background when active */}
        {status !== "idle" && (
          <div className={cn("absolute inset-0 rounded-2xl bg-gradient-to-br opacity-10", config.color)} />
        )}

        <Icon className={cn("relative z-10 text-white/80", sz.icon)} />

        {/* Thinking dots */}
        {status === "thinking" && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="h-1 w-1 rounded-full bg-brand-electric"
                animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
                transition={{
                  duration: 0.8,
                  repeat: Infinity,
                  delay: i * 0.15,
                }}
              />
            ))}
          </div>
        )}

        {/* Done checkmark */}
        {status === "done" && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-semantic-success ring-2 ring-[#11151B]"
          >
            <Check className="h-3 w-3 text-white" />
          </motion.div>
        )}
      </motion.div>

      {showName && (
        <div className="text-center">
          <p className={cn("font-medium text-white/80", sz.name)}>{config.name}</p>
          {status === "thinking" && (
            <motion.p
              className="text-[10px] text-brand-electric"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            >
              分析中…
            </motion.p>
          )}
          {status === "done" && (
            <p className="text-[10px] text-semantic-success">已完成</p>
          )}
          {status === "idle" && (
            <p className="text-[10px] text-white/30">待命</p>
          )}
        </div>
      )}
    </div>
  );
}
