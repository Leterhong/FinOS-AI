"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * StatusBadge —— Phase 6.2 统一状态徽标。
 * 用于：模型状态（AI CFO Online / Model Connected）、Agent 状态、数据同步状态（Data Updated）。
 * 设计：深空黑底 + 银灰描边 + 财富绿/科技蓝/琥珀/红语义色，禁止紫色。
 */

type Tone = "success" | "info" | "warn" | "error" | "neutral";

const TONE_STYLES: Record<Tone, string> = {
  success: "border-semantic-success/25 bg-semantic-success/10 text-semantic-success",
  info: "border-brand-electric/25 bg-brand-electric/10 text-brand-electric",
  warn: "border-semantic-warn/25 bg-semantic-warn/10 text-semantic-warn",
  error: "border-semantic-risk/25 bg-semantic-risk/10 text-semantic-risk",
  neutral: "border-white/15 bg-white/[0.04] text-white/50",
};

const DOT_COLOR: Record<Tone, string> = {
  success: "bg-semantic-success",
  info: "bg-brand-electric",
  warn: "bg-semantic-warn",
  error: "bg-semantic-risk",
  neutral: "bg-white/40",
};

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  /** 是否显示脉冲动画（在线/进行中状态用）。 */
  pulse?: boolean;
  /** 是否显示状态点（默认 true）。 */
  dot?: boolean;
  children: React.ReactNode;
}

export function StatusBadge({
  tone = "neutral",
  pulse = false,
  dot = true,
  className,
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TONE_STYLES[tone],
        className
      )}
      {...props}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          {pulse && (
            <span
              className={cn(
                "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
                DOT_COLOR[tone]
              )}
            />
          )}
          <span
            className={cn(
              "relative inline-flex h-1.5 w-1.5 rounded-full",
              DOT_COLOR[tone]
            )}
          />
        </span>
      )}
      {children}
    </span>
  );
}

/* ── 便捷预设（语义化命名，统一全站状态文案） ── */

export function OnlineBadge({ label = "AI CFO 在线" }: { label?: string }) {
  return (
    <StatusBadge tone="success" pulse>
      {label}
    </StatusBadge>
  );
}

export function ConnectedBadge({ label = "模型已连接" }: { label?: string }) {
  return (
    <StatusBadge tone="success" pulse>
      {label}
    </StatusBadge>
  );
}

export function UpdatedBadge({ label = "数据已更新" }: { label?: string }) {
  return <StatusBadge tone="info">{label}</StatusBadge>;
}
