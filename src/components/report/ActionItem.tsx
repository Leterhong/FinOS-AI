"use client";

import { motion } from "framer-motion";

interface ActionItemProps {
  number: number;
  title: string;
  description: string;
  impact: string;
  delay?: number;
}

export default function ActionItem({
  number,
  title,
  description,
  impact,
  delay = 0,
}: ActionItemProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay }}
      className="flex items-start gap-4 rounded-xl bg-white/[0.03] p-4 border border-white/5"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-brand text-sm font-bold text-white">
        {number}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <h4 className="font-medium text-white">{title}</h4>
          <span className="shrink-0 rounded-full bg-semantic-success/15 px-2.5 py-0.5 text-[11px] font-medium text-semantic-success whitespace-nowrap">
            {impact}
          </span>
        </div>
        <p className="mt-1 text-xs text-white/50 leading-relaxed">{description}</p>
      </div>
    </motion.div>
  );
}
