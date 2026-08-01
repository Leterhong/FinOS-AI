"use client";

import Link from "next/link";
import GlassCard from "../ui/GlassCard";
import { ArrowRight, GitBranch } from "lucide-react";
import { motion } from "framer-motion";

export default function BentoTwinCTA({ delay = 0 }: { delay?: number }) {
  return (
    <Link href="/twin" className="col-span-12 block">
      <GlassCard className="relative overflow-hidden p-6 md:p-8" interactive glow delay={delay}>
        {/* Background gradient */}
        <motion.div
          className="absolute inset-0 bg-gradient-brand opacity-10"
          animate={{
            backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          style={{ backgroundSize: "200% 200%" }}
        />

        {/* Decorative elements */}
        <motion.div
          className="absolute right-10 top-1/2 -translate-y-1/2 h-32 w-32 rounded-full bg-brand-electric/20 blur-3xl hidden md:block"
          animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 4, repeat: Infinity }}
        />
        <motion.div
          className="absolute right-28 top-1/2 -translate-y-1/2 h-24 w-24 rounded-full bg-brand-purple/20 blur-3xl hidden md:block"
          animate={{ scale: [1.2, 1, 1.2], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 5, repeat: Infinity }}
        />

        <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex h-12 w-12 md:h-14 md:w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-brand shadow-glow-blue">
              <GitBranch className="h-6 w-6 md:h-7 md:w-7 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] md:text-xs uppercase tracking-widest text-white/40 mb-1">财务数字孪生</p>
              <h3 className="text-lg md:text-2xl font-bold text-gradient-brand leading-tight">
                模拟您的财务未来
              </h3>
              <p className="mt-1 text-xs md:text-sm text-white/50 max-w-lg">
                切换人生事件，实时观察财富轨迹变化
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-gradient-brand px-5 py-2.5 md:px-6 md:py-3 font-semibold text-white shadow-glow-blue shrink-0">
            <span className="text-sm md:text-base">开始模拟</span>
            <motion.span
              animate={{ x: [0, 4, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <ArrowRight className="h-4 w-4 md:h-5 md:w-5" />
            </motion.span>
          </div>
        </div>
      </GlassCard>
    </Link>
  );
}
