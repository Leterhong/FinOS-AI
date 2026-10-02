"use client";

/**
 * 轮换提示：AI 长耗时阶段显示会变化的短句，缓解「是不是卡住了」的等待焦虑。
 * 明确不制造假进度——只做文字轮换与动画。
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export const DEFAULT_AI_TIPS = [
  "正在连接模型并读取上下文…",
  "正在理解企业资料与规则边界…",
  "推理模型思考耗时较长，属正常情况…",
  "仍在生成中，页面没有卡住…",
  "内容较多时需要更多时间，请稍候…",
];

export function RotatingTip({
  tips = DEFAULT_AI_TIPS,
  intervalMs = 3500,
  className,
}: {
  tips?: string[];
  intervalMs?: number;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (tips.length <= 1) return;
    const timer = setInterval(() => setIndex((value) => (value + 1) % tips.length), intervalMs);
    return () => clearInterval(timer);
  }, [tips, intervalMs]);

  return (
    <p key={index} className={cn("animate-fade-in text-[11px] leading-5 text-slate-500", className)} role="status">
      {tips[index]}
    </p>
  );
}
