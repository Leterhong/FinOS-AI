"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface TimelineScrubberProps {
  ages: number[];
  selectedAge?: number;
  onSelect?: (age: number) => void;
}

export default function TimelineScrubber({
  ages,
  selectedAge,
  onSelect,
}: TimelineScrubberProps) {
  const [hoveredAge, setHoveredAge] = useState<number | null>(null);

  return (
    <div className="relative px-4 py-6">
      {/* Track line */}
      <div className="absolute left-4 right-4 top-1/2 h-px bg-white/10" />

      <div className="relative flex justify-between">
        {ages.map((age) => {
          const isSelected = selectedAge === age;
          const isHovered = hoveredAge === age;

          return (
            <button
              key={age}
              className="flex flex-col items-center gap-2 group"
              onMouseEnter={() => setHoveredAge(age)}
              onMouseLeave={() => setHoveredAge(null)}
              onClick={() => onSelect?.(age)}
            >
              <motion.div
                className={cn(
                  "h-3 w-3 rounded-full border-2 transition-colors",
                  isSelected
                    ? "bg-brand-electric border-brand-electric shadow-glow-blue"
                    : "bg-surface border-white/20 group-hover:border-brand-electric/60 group-hover:bg-brand-electric/20"
                )}
                animate={{
                  scale: isSelected || isHovered ? 1.3 : 1,
                }}
              />
              <span
                className={cn(
                  "text-[11px] numeric transition-colors",
                  isSelected ? "text-brand-electric font-semibold" : "text-white/40 group-hover:text-white/70"
                )}
              >
                {age}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
