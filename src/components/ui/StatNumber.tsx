"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";
import { formatCurrencyFull } from "@/lib/utils";

interface StatNumberProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
  className?: string;
  currency?: boolean;
}

export default function StatNumber({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  duration = 1.4,
  className = "",
  currency = false,
}: StatNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!isInView) return;

    let startTime: number;
    const startValue = 0;
    const endValue = value;

    function animate(currentTime: number) {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / (duration * 1000), 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      const current = startValue + (endValue - startValue) * eased;
      setDisplay(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    }

    requestAnimationFrame(animate);
  }, [isInView, value, duration]);

  const formatted = currency
    ? formatCurrencyFull(display, prefix)
    : `${prefix}${decimals > 0 ? display.toFixed(decimals) : Math.round(display).toLocaleString("zh-CN")}${suffix}`;

  return (
    <span ref={ref} className={`numeric ${className}`}>
      {formatted}
    </span>
  );
}
