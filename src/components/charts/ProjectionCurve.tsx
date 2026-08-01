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
import type { ProjectionPoint } from "@/data/types";
import { useChartColors } from "./useChartColors";
import { formatCurrency } from "@/lib/utils";

interface ProjectionCurveProps {
  data: ProjectionPoint[];
  scenarioData?: ProjectionPoint[];
  retirementAge?: number;
  targetAmount?: number;
  height?: number;
}

interface TooltipPayloadItem {
  dataKey: string;
  value: number;
  color: string;
  payload: ProjectionPoint;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as ProjectionPoint;
  return (
    <div className="glass-strong rounded-xl p-3 text-xs shadow-glass min-w-[120px]">
      <p className="font-medium text-white mb-1">
        Age {point.age}{" "}
        {point.label && (
          <span className="text-brand-electric">· {point.label}</span>
        )}
      </p>
      {payload.map((p: TooltipPayloadItem, i: number) => (
        <p key={i} className="flex items-center gap-2">
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

export default function ProjectionCurve({
  data,
  scenarioData,
  retirementAge,
  targetAmount,
  height = 280,
}: ProjectionCurveProps) {
  const colors = useChartColors();

  // Merge data for Recharts
  const chartData = data.map((point, i) => ({
    ...point,
    ...(scenarioData && { scenario: scenarioData[i]?.assets }),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="projectGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colors.electric} stopOpacity={0.35} />
            <stop offset="100%" stopColor={colors.electric} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="scenarioGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colors.purple} stopOpacity={0.3} />
            <stop offset="100%" stopColor={colors.purple} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
        <XAxis
          dataKey="age"
          axisLine={false}
          tickLine={false}
          tick={{ fill: colors.textMuted, fontSize: 11 }}
          tickFormatter={(v) => `${v}`}
        />
        <YAxis hide />
        <Tooltip content={<CustomTooltip />} />
        {retirementAge && (
          <ReferenceLine
            x={retirementAge}
            stroke={colors.success}
            strokeDasharray="4 4"
            strokeWidth={1}
            label={{
              value: "Retire",
              fill: colors.success,
              fontSize: 10,
              position: "top",
            }}
          />
        )}
        {targetAmount && (
          <ReferenceLine
            y={targetAmount}
            stroke={colors.warn}
            strokeDasharray="4 4"
            strokeWidth={1}
            label={{
              value: "Target",
              fill: colors.warn,
              fontSize: 10,
              position: "right",
            }}
          />
        )}
        <Area
          type="monotone"
          dataKey="assets"
          stroke={colors.electric}
          strokeWidth={2.5}
          fill="url(#projectGrad)"
          isAnimationActive
          animationDuration={1400}
          name="Baseline"
        />
        {scenarioData && (
          <Area
            type="monotone"
            dataKey="scenario"
            stroke={colors.purple}
            strokeWidth={2}
            strokeDasharray="6 3"
            fill="url(#scenarioGrad)"
            isAnimationActive
            animationDuration={1400}
            name="Scenario"
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
