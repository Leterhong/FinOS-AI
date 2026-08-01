"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface GlowDotProps {
  color?: "success" | "blue" | "purple" | "risk" | "warn";
  size?: "sm" | "md" | "lg";
  className?: string;
  pulse?: boolean;
}

const colorMap = {
  success: "bg-semantic-success",
  blue: "bg-brand-electric",
  purple: "bg-brand-purple",
  risk: "bg-semantic-risk",
  warn: "bg-semantic-warn",
};

const sizeMap = {
  sm: "h-1.5 w-1.5",
  md: "h-2.5 w-2.5",
  lg: "h-3 w-3",
};

export default function GlowDot({
  color = "success",
  size = "md",
  className,
  pulse = true,
}: GlowDotProps) {
  return (
    <motion.span
      className={cn(
        "inline-block rounded-full",
        colorMap[color],
        sizeMap[size],
        className
      )}
      animate={
        pulse
          ? {
              scale: [1, 1.3, 1],
              opacity: [1, 0.5, 1],
            }
          : undefined
      }
      transition={
        pulse
          ? {
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }
          : undefined
      }
    />
  );
}
