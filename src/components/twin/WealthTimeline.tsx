"use client";

import { motion } from "framer-motion";
import type { WealthTimelinePoint } from "@/twin/engine";

function fmt(n: number): string {
  if (n >= 1e8) return `¥${(n / 1e8).toFixed(2)}亿`;
  if (n >= 1e4) return `¥${(n / 1e4).toFixed(0)}万`;
  return `¥${n.toLocaleString()}`;
}

const kindColor: Record<string, string> = {
  past: "#64748b",
  present: "#0EA5E9",
  future: "#00D68F",
  goal: "#00D68F",
};

const kindLabel: Record<string, string> = {
  past: "过去",
  present: "现在",
  future: "未来",
  goal: "目标",
};

/** 财富变化时间线：过去 → 现在 → 未来 → 目标。 */
export default function WealthTimeline({
  timeline,
}: {
  timeline: WealthTimelinePoint[];
}) {
  if (!timeline?.length) return null;
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {timeline.map((p, i) => (
        <motion.div
          key={`${p.year}-${i}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="min-w-[120px] shrink-0 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10"
        >
          <div className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: kindColor[p.kind] }}
            />
            <span className="text-[11px] text-white/40">
              {kindLabel[p.kind] === "现在" || kindLabel[p.kind] === "目标"
                ? kindLabel[p.kind]
                : `${p.year}`}
            </span>
          </div>
          <div className="mt-1 text-sm font-semibold text-white">
            {fmt(p.assets)}
          </div>
          <div className="text-[11px] text-white/40">
            {p.label ?? `${p.age}岁`}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
