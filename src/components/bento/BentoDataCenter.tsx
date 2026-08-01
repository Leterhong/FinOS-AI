"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useFinancialStore } from "@/store/financial-store";
import GlassCard from "@/components/ui/GlassCard";
import {
  Database,
  Upload,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Wallet,
  PieChart,
  Sparkles,
  AlertTriangle,
  Info,
  CheckCircle2,
} from "lucide-react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

/**
 * Financial Data Center（Phase 6 十二）。
 * Bento 卡片：资产总览 / 收入趋势 / 消费分析 / 投资分析 / 数据更新时间 / 数据洞察。
 * 数据来自真实导入的银行流水与持仓文件。
 */
export default function BentoDataCenter({ delay = 0 }: { delay?: number }) {
  const summary = useFinancialStore((s) => s.financialSummary);
  const insights = useFinancialStore((s) => s.financialInsights);
  const isLoadingInsights = useFinancialStore((s) => s.isLoadingInsights);
  const runDataInsight = useFinancialStore((s) => s.runDataInsight);
  const refreshData = useFinancialStore((s) => s.refreshData);

  const hasData = summary?.hasData ?? false;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <GlassCard className="relative overflow-hidden p-5 h-full" glow>
        {/* 头部 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-brand shadow-glow-purple">
              <Database className="h-5 w-5 text-white" />
            </span>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/40">
                Financial Data Center
              </p>
              <h3 className="text-base font-bold text-white">金融数据中心</h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {summary?.updatedAt && (
              <span className="text-[10px] text-white/30">
                数据更新于 {new Date(summary.updatedAt).toLocaleString("zh-CN")}
              </span>
            )}
            <button
              onClick={() => refreshData()}
              className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-[11px] text-white/70 ring-1 ring-white/10 transition hover:bg-white/10"
            >
              <RefreshCw className="h-3 w-3" />
              刷新
            </button>
            <Link
              href="/data"
              className="flex items-center gap-1.5 rounded-lg bg-brand-purple/15 px-3 py-1.5 text-[11px] text-brand-purple ring-1 ring-brand-purple/30 transition hover:bg-brand-purple/25"
            >
              <Upload className="h-3 w-3" />
              导入数据
            </Link>
          </div>
        </div>

        {!hasData ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Database className="mb-3 h-10 w-10 text-white/15" />
            <p className="mb-1 text-sm text-white/60">尚未接入真实金融数据</p>
            <p className="mb-4 text-xs text-white/35">
              导入银行流水 / 基金持仓 / 工资记录后，AI 将基于真实数据理解你的财富状态
            </p>
            <Link
              href="/data"
              className="rounded-xl bg-gradient-brand px-5 py-2 text-xs font-semibold text-white shadow-glow-purple transition hover:opacity-90"
            >
              前往数据中心导入 →
            </Link>
          </div>
        ) : (
          <>
            {/* 顶部指标 */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              <Stat
                icon={<Wallet className="h-4 w-4" />}
                label="月均收入"
                value={`¥${Math.round(summary!.avgMonthlyIncome).toLocaleString()}`}
              />
              <Stat
                icon={<TrendingDown className="h-4 w-4" />}
                label="月均支出"
                value={`¥${Math.round(summary!.avgMonthlyExpense).toLocaleString()}`}
              />
              <Stat
                icon={<TrendingUp className="h-4 w-4" />}
                label="平均储蓄率"
                value={`${Math.round(summary!.avgSavingsRate * 100)}%`}
              />
              <Stat
                icon={<PieChart className="h-4 w-4" />}
                label="投资市值"
                value={`¥${Math.round(summary!.totalInvestment).toLocaleString()}`}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* 收入支出趋势 */}
              <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] text-white/40">
                  <TrendingUp className="h-3.5 w-3.5 text-brand-electric" />
                  收支趋势（真实流水 · {summary!.transactionCount} 笔）
                </div>
                <div className="h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={summary!.monthlyCashFlow.slice(-6)}>
                      <XAxis
                        dataKey="month"
                        tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: string) => v.slice(5)}
                      />
                      <YAxis hide />
                      <Tooltip
                        contentStyle={{
                          background: "rgba(15,15,25,0.95)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: 12,
                          fontSize: 11,
                        }}
                        formatter={(v: number, name: string) => [
                          `¥${Math.round(v).toLocaleString()}`,
                          name === "income" ? "收入" : name === "expense" ? "支出" : "净结余",
                        ]}
                      />
                      <Bar dataKey="income" fill="#00D68F" radius={[4, 4, 0, 0]} barSize={10} />
                      <Bar dataKey="expense" fill="rgba(255,255,255,0.18)" radius={[4, 4, 0, 0]} barSize={10} />
                      <Line dataKey="net" stroke="#22d3ee" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* 消费分析 */}
              <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] text-white/40">
                  <PieChart className="h-3.5 w-3.5 text-brand-purple" /> 消费结构 TOP5
                </div>
                <div className="space-y-2">
                  {summary!.categoryStats.slice(0, 5).map((c) => (
                    <div key={c.category}>
                      <div className="mb-0.5 flex items-center justify-between text-[11px]">
                        <span className="text-white/60">{c.label}</span>
                        <span className="text-white/80">
                          ¥{Math.round(c.amount).toLocaleString()}
                          <span className="ml-1 text-white/35">{Math.round(c.ratio * 100)}%</span>
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/5">
                        <div
                          className="h-1.5 rounded-full bg-gradient-brand"
                          style={{ width: `${Math.min(c.ratio * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 数据洞察 */}
            <div className="mt-4 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] text-white/40">
                  <Sparkles className="h-3.5 w-3.5 text-amber-300" /> AI 数据洞察
                </div>
                <button
                  onClick={() => runDataInsight()}
                  disabled={isLoadingInsights}
                  className="flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1 text-[10px] text-white/60 ring-1 ring-white/10 transition hover:bg-white/10 disabled:opacity-50"
                >
                  <RefreshCw className={`h-2.5 w-2.5 ${isLoadingInsights ? "animate-spin" : ""}`} />
                  {isLoadingInsights ? "分析中…" : "生成洞察"}
                </button>
              </div>
              {insights.length === 0 ? (
                <p className="text-xs text-white/35">点击「生成洞察」，AI 将从你的真实数据中发现消费规律与风险信号。</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {insights.slice(0, 4).map((ins) => (
                    <div
                      key={ins.id}
                      className="flex items-start gap-2 rounded-lg bg-white/[0.03] p-2.5 ring-1 ring-white/5"
                    >
                      <InsightIcon level={ins.level} />
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-white/85 leading-snug">{ins.title}</p>
                        <p className="mt-0.5 text-[10px] leading-relaxed text-white/45 line-clamp-2">{ins.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </GlassCard>
    </motion.div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
      <div className="mb-1 flex items-center gap-1.5 text-white/35">{icon}
        <span className="text-[10px]">{label}</span>
      </div>
      <p className="text-sm font-bold text-white">{value}</p>
    </div>
  );
}

function InsightIcon({ level }: { level: string }) {
  if (level === "critical")
    return <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />;
  if (level === "warning")
    return <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />;
  if (level === "positive")
    return <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />;
  return <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-electric" />;
}
