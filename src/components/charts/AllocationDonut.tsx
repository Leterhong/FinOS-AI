"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import type { AssetClass } from "@/data/types";
import { formatCurrency } from "@/lib/utils";

interface AllocationDonutProps {
  data: AssetClass[];
  size?: number;
}

export default function AllocationDonut({ data, size = 200 }: AllocationDonutProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={size * 0.3}
            outerRadius={size * 0.44}
            paddingAngle={2}
            dataKey="value"
            isAnimationActive
            animationDuration={1200}
            strokeWidth={0}
          >
            {data.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold numeric">{formatCurrency(total)}</span>
        <span className="text-[10px] uppercase tracking-widest text-white/40">Total</span>
      </div>
    </div>
  );
}
