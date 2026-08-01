"use client";

import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Calendar, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface ScenarioDeltaProps {
  deltaAssets: number;
  deltaRetirementYears: number;
  baselineRetireAge: number;
  scenarioRetireAge: number;
}

export default function ScenarioDelta({
  deltaAssets,
  deltaRetirementYears,
  baselineRetireAge,
  scenarioRetireAge,
}: ScenarioDeltaProps) {
  const improved = deltaRetirementYears > 0;
  const assetsImproved = deltaAssets > 0;

  return (
    <motion.div
      key={`${deltaAssets}-${deltaRetirementYears}`}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="rounded-xl glass p-5 mt-4"
    >
      <p className="text-xs uppercase tracking-widest text-white/40 mb-4">Scenario Impact</p>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-white/50">
            <Calendar className="h-3.5 w-3.5" />
            Retirement Age
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold numeric">{scenarioRetireAge}</span>
            <span className="text-sm text-white/40">from {baselineRetireAge}</span>
          </div>
          <div
            className={cn(
              "flex items-center gap-1 text-xs font-medium",
              improved ? "text-semantic-success" : "text-semantic-risk"
            )}
          >
            {improved ? (
              <TrendingDown className="h-3 w-3" />
            ) : (
              <TrendingUp className="h-3 w-3" />
            )}
            {improved ? "-" : "+"}{Math.abs(deltaRetirementYears)} years
            {improved ? " earlier" : " later"}
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-white/50">
            <Wallet className="h-3.5 w-3.5" />
            Final Assets
          </div>
          <div className="text-2xl font-bold numeric">
            {assetsImproved ? "+" : ""}
            {formatCurrency(deltaAssets)}
          </div>
          <div
            className={cn(
              "text-xs font-medium",
              assetsImproved ? "text-semantic-success" : "text-semantic-risk"
            )}
          >
            vs. baseline
          </div>
        </div>
      </div>
    </motion.div>
  );
}
