"use client";

import { motion } from "framer-motion";
import { Home, Rocket, Briefcase, Heart, Baby, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Home,
  Rocket,
  Briefcase,
  Heart,
  Baby,
  TrendingUp,
};

interface LifeEventChipProps {
  id: string;
  label: string;
  icon: string;
  description: string;
  active: boolean;
  onToggle: () => void;
}

export default function LifeEventChip({
  label,
  icon,
  description,
  active,
  onToggle,
}: LifeEventChipProps) {
  const Icon = iconMap[icon] || TrendingUp;

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onToggle}
      className={cn(
        "relative w-full rounded-xl p-4 text-left transition-all duration-300",
        "glass border",
        active
          ? "border-brand-electric/40 bg-brand-electric/10 shadow-glow-blue"
          : "border-white/8 hover:border-white/15 hover:bg-white/[0.06]"
      )}
    >
      {active && (
        <motion.div
          layoutId="activeEvent"
          className="absolute inset-0 rounded-xl border border-brand-electric/30"
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      )}
      <div className="relative flex items-start gap-3">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            active
              ? "bg-gradient-brand text-white shadow-glow-blue"
              : "bg-white/5 text-white/60"
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className={cn("text-sm font-medium", active ? "text-white" : "text-white/80")}>
            {label}
          </p>
          <p className="mt-0.5 text-[11px] text-white/40 leading-relaxed">{description}</p>
        </div>
        {active && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="ml-auto h-5 w-5 shrink-0 rounded-full bg-semantic-success flex items-center justify-center"
          >
            <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </motion.div>
        )}
      </div>
    </motion.button>
  );
}
