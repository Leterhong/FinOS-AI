"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { MonthlyTrend } from "@/data/types";
import { useChartColors } from "./useChartColors";
import { formatCurrency } from "@/lib/utils";

interface CashFlowBarsProps {
  data: MonthlyTrend[];
  height?: number;
}

interface TooltipPayloadItem {
  dataKey: string;
  value: number;
  color: string;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-strong rounded-xl p-3 text-xs shadow-glass">
      <p className="font-medium text-white mb-1">{label}</p>
      {payload.map((p: TooltipPayloadItem) => (
        <p key={p.dataKey} className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: p.color }}
          />
          <span className="text-white/60 capitalize">{p.dataKey}:</span>
          <span className="text-white numeric">{formatCurrency(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

export default function CashFlowBars({ data, height = 200 }: CashFlowBarsProps) {
  const colors = useChartColors();

  // Phase 6.3 #217：无数据时展示空状态（不再有硬编码 Demo 趋势兜底）
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-dashed border-white/10 text-xs text-white/35"
        style={{ height }}
      >
        暂无月度收支数据 · 完善画像或导入流水后展示
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barGap={4} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colors.electric} stopOpacity={1} />
            <stop offset="100%" stopColor={colors.electric} stopOpacity={0.6} />
          </linearGradient>
          <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colors.risk} stopOpacity={1} />
            <stop offset="100%" stopColor={colors.risk} stopOpacity={0.6} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
        <XAxis
          dataKey="month"
          axisLine={false}
          tickLine={false}
          tick={{ fill: colors.textMuted, fontSize: 11 }}
        />
        <YAxis hide />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.02)" }} />
        <Bar
          dataKey="income"
          fill="url(#incomeGrad)"
          radius={[6, 6, 0, 0]}
          isAnimationActive
          animationDuration={1200}
        />
        <Bar
          dataKey="expenses"
          fill="url(#expenseGrad)"
          radius={[6, 6, 0, 0]}
          isAnimationActive
          animationDuration={1200}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
