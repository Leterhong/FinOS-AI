"use client";

import { useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * 轻量 Toast hook（不引入第三方依赖）。
 * 返回 toast(message) 触发提示，以及需要在组件根部渲染的 <Toast /> 节点。
 */
export function useToast() {
  const [message, setMessage] = useState<string | null>(null);

  const toast = useCallback((msg: string) => {
    setMessage(msg);
    window.clearTimeout((toast as unknown as { _t?: number })._t);
    (toast as unknown as { _t?: number })._t = window.setTimeout(
      () => setMessage(null),
      3200
    );
  }, []);

  const Toast = (
    <AnimatePresence>
      {message && (
        <motion.div
          key={message}
          initial={{ opacity: 0, y: -16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.96 }}
          transition={{ duration: 0.25 }}
          role="alert"
          className="fixed left-1/2 top-6 z-[200] flex -translate-x-1/2 items-center gap-2 rounded-xl border border-amber-400/40 bg-[#1a1207]/95 px-4 py-2.5 text-sm font-medium text-amber-100 shadow-lg shadow-black/40 backdrop-blur-md"
        >
          <span aria-hidden>⚠️</span>
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return { toast, Toast };
}
