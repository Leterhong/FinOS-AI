"use client";

import { useId } from "react";
import { AreaChart, Area } from "recharts";

interface SparklineProps {
  data: { value: number }[];
  color?: string;
  height?: number;
  width?: number;
}

export default function Sparkline({
  data,
  color = "#0EA5E9",
  height = 40,
  width = 100,
}: SparklineProps) {
  // Stable, SSR/client-consistent id prefix. Recharts generates clipPath ids from
  // a module-level counter by default, which mismatches between server and client
  // (hydration warning). useId() is tree-position-based and identical on both sides.
  const uid = `spark-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <AreaChart id={uid} width={width} height={height} data={data}>
      <defs>
        <linearGradient id={`${uid}-gradient`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <Area
        type="monotone"
        dataKey="value"
        stroke={color}
        strokeWidth={1.5}
        fill={`url(#${uid}-gradient)`}
        isAnimationActive={false}
      />
    </AreaChart>
  );
}
