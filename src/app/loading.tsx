"use client";

import { motion } from "framer-motion";
import Logo from "@/components/brand/Logo";

/**
 * 全局初始化 Loading 页（Phase 5.7）。
 * 企业研判空间初始化 / 路由切换时展示轻量品牌反馈。
 */
export default function Loading() {
  return (
    <div className="flex min-h-[65vh] flex-col items-center justify-center gap-5">
      <motion.div
        initial={{ opacity: 0, scale: 0.82, filter: "blur(10px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        <Logo size={72} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.6 }}
        className="text-center"
      >
        <p className="text-lg font-semibold tracking-tight text-white/90">
          正在连接企业研判空间
        </p>
        <p className="mt-1.5 text-sm text-white/40">
          正在装载资料、规则与风险上下文…
        </p>
      </motion.div>

      <motion.div
        className="h-0.5 w-36 overflow-hidden rounded-full bg-white/10"
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
