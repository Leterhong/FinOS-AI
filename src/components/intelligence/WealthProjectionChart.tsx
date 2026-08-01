"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import { useChartColors } from "@/components/charts/useChartColors";
import { formatCurrency } from "@/lib/utils";
import type { WealthSeriesPoint } from "@/types/intelligence";

interface WealthProjectionChartProps {
  series: WealthSeriesPoint[];
  currentAge?: number | null;
  retirementAge?: number;
  targetAmount?: number;
  height?: number;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { value: number; payload: WealthSeriesPoint }[] }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="glass-strong rounded-xl p-3 text-xs shadow-glass min-w-[140px]">
      <p className="font-medium text-white mb-1">
        {point.year} 年后{point.year > 0 && currentAgeLabel(point, undefined)}
      </p>
      <p className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-brand-electric" />
        <span className="text-white/60">净资产：</span>
        <span className="text-white numeric">{formatCurrency(point.netWorth)}</span>
      </p>
    </div>
  );
}

function currentAgeLabel(point: WealthSeriesPoint, age?: number) {
  return age ? `（约 ${age + point.year} 岁）` : "";
}

export default function WealthProjectionChart({
  series,
  currentAge,
  retirementAge,
  targetAmount,
  height = 300,
}: WealthProjectionChartProps) {
  const colors = useChartColors();
  const data = series.map((p) => ({
    ...p,
    age: currentAge != null ? currentAge + p.year : p.year,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 20, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="wiProjGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colors.electric} stopOpacity={0.35} />
            <stop offset="100%" stopColor={colors.electric} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
        <XAxis
          dataKey="age"
          axisLine={false}
          tickLine={false}
          tick={{ fill: colors.textMuted, fontSize: 11 }}
          tickFormatter={(v) => `${v}岁`}
        />
        <YAxis hide />
        <Tooltip content={<CustomTooltip />} />
        {retirementAge && currentAge != null && retirementAge > currentAge && (
          <ReferenceLine
            x={retirementAge}
            stroke={colors.success}
            strokeDasharray="4 4"
            strokeWidth={1}
            label={{ value: "退休", fill: colors.success, fontSize: 10, position: "top" }}
          />
        )}
        {targetAmount && targetAmount > 0 && (
          <ReferenceLine
            y={targetAmount}
            stroke={colors.warn}
            strokeDasharray="4 4"
            strokeWidth={1}
            label={{ value: "目标", fill: colors.warn, fontSize: 10, position: "right" }}
          />
        )}
        <Area
          type="monotone"
          dataKey="netWorth"
          stroke={colors.electric}
          strokeWidth={2.5}
          fill="url(#wiProjGrad)"
          isAnimationActive
          animationDuration={1400}
          name="净资产"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
