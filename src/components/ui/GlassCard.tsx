"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
  glow?: boolean;
  delay?: number;
}

export default function GlassCard({
  children,
  className,
  interactive = false,
  glow = false,
  delay = 0,
}: GlassCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay,
        ease: [0.22, 1, 0.36, 1],
      }}
      whileHover={
        interactive
          ? {
              y: -4,
              transition: { duration: 0.2, ease: "easeOut" },
            }
          : undefined
      }
      className={cn(
        "relative rounded-2xl glass text-white overflow-hidden",
        glow && "glow-ring",
        interactive && "cursor-pointer transition-shadow duration-300 hover:shadow-glow-blue",
        className
      )}
    >
      {children}
    </motion.div>
  );
}
