"use client";

import GlassCard from "../ui/GlassCard";
import { ArrowDown, ArrowUp, PiggyBank } from "lucide-react";
import type { MonthlyTrend } from "@/data/types";
import Sparkline from "../charts/Sparkline";
import { formatCurrency } from "@/lib/utils";

interface BentoCashFlowProps {
  income: number;
  expenses: number;
  savingsRate: number;
  trend: MonthlyTrend[];
  delay?: number;
}

export default function BentoCashFlow({
  income,
  expenses,
  savingsRate,
  trend,
  delay = 0,
}: BentoCashFlowProps) {
  const sparkData = trend.map((t) => ({ value: t.income - t.expenses }));

  return (
    <GlassCard className="flex flex-col justify-between p-6" interactive delay={delay}>
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-white/40">现金流</p>
        <PiggyBank className="h-4 w-4 text-brand-purple" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <div className="flex items-center gap-1 text-[11px] text-white/40">
            <ArrowUp className="h-3 w-3 text-semantic-success" />
            收入
          </div>
          <p className="text-sm font-semibold numeric">{formatCurrency(income)}</p>
        </div>
        <div>
          <div className="flex items-center gap-1 text-[11px] text-white/40">
            <ArrowDown className="h-3 w-3 text-semantic-risk" />
            支出
          </div>
          <p className="text-sm font-semibold numeric">{formatCurrency(expenses)}</p>
        </div>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <p className="text-[11px] text-white/40">储蓄率</p>
          <p className="text-lg font-bold text-semantic-success numeric">{savingsRate.toFixed(1)}%</p>
        </div>
        <Sparkline data={sparkData} color="#00D68F" height={36} width={80} />
      </div>
    </GlassCard>
  );
}
