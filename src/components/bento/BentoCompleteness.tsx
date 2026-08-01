"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import GlassCard from "@/components/ui/GlassCard";
import { useFinancialStore } from "@/store/financial-store";
import { computeWealthCompleteness } from "@/financial-profile/completeness";
import { ClipboardCheck, ArrowRight, CheckCircle2 } from "lucide-react";

/**
 * 财富数据完整度（Phase 6.7 需求十四）。
 * Dashboard Bento 卡片：展示财富数据完整度百分比 + 缺失维度引导，
 * 引导用户逐步完善真实财富数据（手动填写 / 上传资料 / 导入数据）。
 */
export default function BentoCompleteness({ delay = 0 }: { delay?: number }) {
  const profile = useFinancialStore((s) => s.profile);
  const financialSummary = useFinancialStore((s) => s.financialSummary);
  const completeness = computeWealthCompleteness(profile, financialSummary);

  const complete = completeness.percent >= 100;
  const ringColor = complete
    ? "stroke-emerald-400"
    : completeness.percent >= 60
      ? "stroke-brand-electric"
      : "stroke-amber-400";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="h-full"
    >
      <GlassCard className="relative flex h-full flex-col overflow-hidden p-5" glow>
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-brand shadow-glow-blue">
            <ClipboardCheck className="h-5 w-5 text-white" />
          </span>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-white/40">
              Wealth Completeness
            </p>
            <h3 className="text-base font-bold text-white">财富数据完整度</h3>
          </div>
        </div>

        <div className="flex items-center gap-5">
          {/* 环形进度 */}
          <div className="relative h-20 w-20 shrink-0">
            <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
              <circle
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="3.5"
              />
              <circle
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                className={ringColor}
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray={`${(completeness.percent / 100) * 97.4} 97.4`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-bold text-white">
                {completeness.percent}%
              </span>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            {complete ? (
              <p className="flex items-center gap-1.5 text-sm text-emerald-300">
                <CheckCircle2 className="h-4 w-4" />
                财富数据已完善，分析更可靠
              </p>
            ) : (
              <p className="text-sm text-white/70">
                已完善 <b className="text-white">{completeness.filled}</b> /{" "}
                {completeness.total} 项，补全后 AI 分析更精准
              </p>
            )}

            {/* 缺失维度引导（最多展示 4 项） */}
            {!complete && completeness.missing.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {completeness.missing.slice(0, 4).map((m) => (
                  <Link
                    key={m.key}
                    href={m.href}
                    className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/55 ring-1 ring-white/10 transition hover:bg-white/[0.08] hover:text-white/80"
                  >
                    {m.label}
                    <span className="ml-1 text-white/30">＋</span>
                  </Link>
                ))}
                {completeness.missing.length > 4 && (
                  <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/35 ring-1 ring-white/10">
                    等 {completeness.missing.length} 项
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {!complete && (
          <div className="mt-auto pt-4">
            <Link
              href="/documents"
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white/5 px-4 py-2 text-xs font-semibold text-white/80 ring-1 ring-white/10 transition hover:bg-white/10"
            >
              去完善财富数据
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}
      </GlassCard>
    </motion.div>
  );
}
