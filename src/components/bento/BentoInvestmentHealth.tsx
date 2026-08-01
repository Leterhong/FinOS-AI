"use client";

// ── Dashboard 投资健康卡片（Phase 6.9 需求十二）────────────────────────────
// 显示：投资组合价值 / 今日变化 / 风险等级（健康评分）/ 最新投资提醒。
// 数据来自 /api/finance/portfolio（纯代码计算，0 次 LLM 调用）。
// 无投资 → 「暂无投资数据」引导；无数据源 → 提示配置（绝不伪造行情）。

import { useEffect } from "react";
import Link from "next/link";
import { useFinancialStore } from "@/store/financial-store";
import GlassCard from "@/components/ui/GlassCard";
import { cn, formatCurrency } from "@/lib/utils";
import { timeAgo } from "@/lib/time";
import { TrendingUp, ArrowRight, Bell, Loader2 } from "lucide-react";

/** 涨跌颜色：红涨绿跌（中国市场惯例） */
function updownClass(v: number | null | undefined): string {
  if (v === null || v === undefined) return "text-white/40";
  if (v > 0) return "text-red-400";
  if (v < 0) return "text-emerald-300";
  return "text-white/60";
}

const GRADE_META: Record<string, { label: string; cls: string }> = {
  excellent: { label: "优秀", cls: "text-emerald-300 bg-emerald-400/10 ring-emerald-400/20" },
  good: { label: "良好", cls: "text-sky-300 bg-sky-400/10 ring-sky-400/20" },
  fair: { label: "一般", cls: "text-amber-300 bg-amber-400/10 ring-amber-400/20" },
  poor: { label: "待改善", cls: "text-rose-300 bg-rose-400/10 ring-rose-400/20" },
};

export default function BentoInvestmentHealth({ delay = 0 }: { delay?: number }) {
  const portfolio = useFinancialStore((s) => s.portfolioView);
  const analysis = useFinancialStore((s) => s.portfolioAnalysis);
  const isLoading = useFinancialStore((s) => s.isLoadingPortfolio);
  const notifications = useFinancialStore((s) => s.proactiveNotifications);
  const currentUserId = useFinancialStore((s) => s.currentUserId);
  const loadPortfolio = useFinancialStore((s) => s.loadPortfolio);

  useEffect(() => {
    if (currentUserId && !portfolio) void loadPortfolio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]);

  // 最新投资相关提醒（market-monitor 来源优先，回退任意最新未忽略提醒）
  const latestAlert =
    notifications.find((n) => !n.dismissed && n.source === "market-monitor") ??
    notifications.find((n) => !n.dismissed) ??
    null;

  const grade = analysis ? GRADE_META[analysis.scoreGrade] : null;

  return (
    <GlassCard className="relative overflow-hidden p-6" glow delay={delay}>
      <div className="relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-electric/15">
              <TrendingUp className="h-5 w-5 text-brand-electric" />
            </span>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/40">
                Investment Health
              </p>
              <h3 className="text-sm font-semibold text-white">投资健康</h3>
            </div>
          </div>
          {grade && (
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium ring-1",
                grade.cls,
              )}
            >
              {analysis!.healthScore} 分 · {grade.label}
            </span>
          )}
        </div>

        {isLoading && !portfolio ? (
          <div className="flex h-28 items-center justify-center text-white/35">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 获取行情中…
          </div>
        ) : !portfolio?.hasInvestments ? (
          <div className="mt-4">
            <p className="text-sm text-white/60">暂无投资数据</p>
            <p className="mt-1 text-[11px] leading-relaxed text-white/35">
              添加股票 / 基金持仓后，此处将展示组合价值、今日变化与风险提醒（行情全部来自真实数据源）。
            </p>
            <Link
              href="/data"
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-brand-electric hover:underline"
            >
              去添加持仓 <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-white/40">组合价值</p>
                <p className="mt-0.5 text-xl font-bold numeric text-white">
                  {formatCurrency(portfolio.totalValue)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-white/40">今日变化</p>
                <p
                  className={cn(
                    "mt-0.5 text-xl font-bold numeric",
                    updownClass(portfolio.todayChangePct),
                  )}
                >
                  {portfolio.todayChangePct !== undefined
                    ? `${portfolio.todayChangePct > 0 ? "+" : ""}${portfolio.todayChangePct.toFixed(2)}%`
                    : "--"}
                </p>
              </div>
            </div>

            {/* 数据状态 / 降级提示 */}
            {portfolio.dataNotice && (
              <p className="mt-2 truncate text-[10px] text-amber-300/80" title={portfolio.dataNotice}>
                {portfolio.dataNotice}
              </p>
            )}

            {/* 最新提醒 */}
            {latestAlert ? (
              <Link
                href="/wealth-monitor"
                className="mt-3 flex items-start gap-2 rounded-xl bg-white/[0.03] p-2.5 ring-1 ring-white/8 transition-colors hover:bg-white/[0.06]"
              >
                <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium text-white/75">
                    {latestAlert.title}
                  </p>
                  <p className="text-[10px] text-white/35">
                    {timeAgo(latestAlert.createdAt)}
                  </p>
                </div>
              </Link>
            ) : (
              <p className="mt-3 text-[11px] text-white/30">暂无投资风险提醒</p>
            )}

            <Link
              href="/investments"
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-brand-electric hover:underline"
            >
              进入投资中心 <ArrowRight className="h-3 w-3" />
            </Link>
          </>
        )}
      </div>
    </GlassCard>
  );
}
