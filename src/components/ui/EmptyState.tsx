"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import GradientText from "@/components/ui/GradientText";

/**
 * EmptyState —— Phase 6.2 统一空状态组件。
 * 所有「没有数据」的地方都使用它，禁止展示 Demo / 占位数字。
 * 支持：图标 / 标题 / 副标题 / 步骤引导 / 主+次行动按钮 / 备注。
 */

export interface EmptyStateAction {
  label: string;
  href: string;
  variant?: "primary" | "outline";
  icon?: React.ReactNode;
}

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** 步骤引导（如「个人信息 / 收入支出 / 资产负债 …」）。 */
  steps?: string[];
  actions?: EmptyStateAction[];
  note?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  subtitle,
  steps,
  actions,
  note,
  className,
}: EmptyStateProps) {
  return (
    <div className="flex min-h-[50vh] w-full items-center justify-center px-2 sm:px-4">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "relative w-full max-w-5xl rounded-3xl glass p-8 text-center shadow-glow-blue sm:p-10",
          className
        )}
      >
        <div className="pointer-events-none absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-brand-electric/20 blur-3xl" />

        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.12, duration: 0.5 }}
          className="relative mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-brand shadow-glow-blue"
        >
          {icon ?? <Sparkles className="h-8 w-8 text-white" />}
        </motion.div>

        <h1 className="relative text-3xl font-bold tracking-tight">
          <GradientText>{title}</GradientText>
        </h1>
        {subtitle && (
          <p className="relative mt-3 text-base leading-relaxed text-white/55">
            {subtitle}
          </p>
        )}

        {steps && steps.length > 0 && (
          <div className="relative mt-8">
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {steps.map((step, i) => (
                <div
                  key={step}
                  className="flex flex-col items-center gap-2 rounded-xl bg-white/[0.03] px-1.5 py-3 ring-1 ring-white/10"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-brand text-xs font-bold text-white">
                    {i + 1}
                  </div>
                  <span className="text-[11px] leading-tight text-white/60">
                    {step}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {actions && actions.length > 0 && (
          <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            {actions.map((a) => (
              <Button
                key={a.label}
                asChild
                size="lg"
                variant={a.variant === "outline" ? "outline" : "default"}
                className="w-full sm:w-auto"
              >
                <Link href={a.href}>
                  {a.icon}
                  {a.label}
                  {!a.icon && <ArrowRight className="h-4 w-4" />}
                </Link>
              </Button>
            ))}
          </div>
        )}

        {note && (
          <p className="relative mt-6 text-[11px] text-white/30">{note}</p>
        )}
      </motion.div>
    </div>
  );
}
