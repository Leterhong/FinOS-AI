"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface ReportSectionProps {
  number: number;
  title: string;
  children: ReactNode;
  delay?: number;
}

export default function ReportSection({
  number,
  title,
  children,
  delay = 0,
}: ReportSectionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      className="glass rounded-2xl p-6"
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand text-sm font-bold text-white">
          {number}
        </div>
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      {children}
    </motion.div>
  );
}
