"use client";

import { motion } from "framer-motion";
import Logo from "@/components/brand/Logo";

/**
 * 全局初始化 Loading 页（Phase 5.7）。
 * 应用初始化 / 路由切换时展示品牌 Logo 渐变动画 + "Building your AI CFO..."。
 */
export default function Loading() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-7 bg-[#070a14]">
      <motion.div
        initial={{ opacity: 0, scale: 0.82, filter: "blur(10px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <Logo size={104} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.6 }}
        className="text-center"
      >
        <p className="text-lg font-semibold tracking-tight text-white/90">
          Building your AI CFO
        </p>
        <p className="mt-1.5 text-sm text-white/40">
          正在为你构建专属的 AI 财富管家…
        </p>
      </motion.div>

      <motion.div
        className="h-1 w-44 overflow-hidden rounded-full bg-white/10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.55 }}
      >
        <motion.div
          className="h-full w-1/2 rounded-full bg-gradient-brand shadow-glow-blue"
          animate={{ x: ["-120%", "220%"] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>
    </div>
  );
}
