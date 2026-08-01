"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Sparkles, ArrowRight } from "lucide-react";
import GlassCard from "@/components/ui/GlassCard";

/**
 * AIMessageCard —— Phase 6.2 统一的 AI 分析结果卡片。
 * 支持：标题 / 摘要 / 详细内容（children）/ 行动建议（actions）。
 * 用于 Chat、Report、Advisor 等所有 AI 产出展示，统一视觉语言。
 */

export interface AIMessageAction {
  title: string;
  description?: string;
  /** 影响标签，如「+3 分」「省税 12%」。 */
  impact?: string;
  /** 提供则整条可点击跳转。 */
  href?: string;
}

export interface AIMessageCardProps {
  title: string;
  summary?: string;
  children?: React.ReactNode;
  actions?: AIMessageAction[];
  tone?: "default" | "success" | "warn";
  className?: string;
}

const HEADER_TONE: Record<AIMessageCardProps["tone"] & {}, string> = {
  default: "bg-gradient-brand text-white shadow-glow-blue",
  success: "bg-semantic-success/15 text-semantic-success",
  warn: "bg-semantic-warn/15 text-semantic-warn",
};

export function AIMessageCard({
  title,
  summary,
  children,
  actions,
  tone = "default",
  className,
}: AIMessageCardProps) {
  return (
    <GlassCard className={cn("p-5", className)}>
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            HEADER_TONE[tone]
          )}
        >
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-white">{title}</h3>
          {summary && (
            <p className="mt-1 text-sm leading-relaxed text-white/60">{summary}</p>
          )}
        </div>
      </div>

      {children && (
        <div className="mt-4 border-t border-white/5 pt-4 text-sm leading-relaxed text-white/70">
          {children}
        </div>
      )}

      {actions && actions.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-[11px] uppercase tracking-widest text-white/40">
            行动建议
          </p>
          {actions.map((a) => {
            const inner = (
              <>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-brand text-xs font-bold text-white">
                  {actions.indexOf(a) + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-white">{a.title}</p>
                    {a.impact && (
                      <span className="shrink-0 rounded-full bg-semantic-success/15 px-2.5 py-0.5 text-[11px] font-medium text-semantic-success">
                        {a.impact}
                      </span>
                    )}
                  </div>
                  {a.description && (
                    <p className="mt-0.5 text-xs leading-relaxed text-white/50">
                      {a.description}
                    </p>
                  )}
                </div>
                {a.href && (
                  <ArrowRight className="h-4 w-4 shrink-0 self-center text-white/40" />
                )}
              </>
            );
            return a.href ? (
              <Link
                key={a.title}
                href={a.href}
                className="flex items-start gap-3 rounded-xl bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.06]"
              >
                {inner}
              </Link>
            ) : (
              <div
                key={a.title}
                className="flex items-start gap-3 rounded-xl bg-white/[0.03] p-3"
              >
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
