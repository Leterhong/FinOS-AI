"use client";

import { motion } from "framer-motion";
import { useFinancialStore } from "@/store/financial-store";
import GlassCard from "@/components/ui/GlassCard";
import { Cpu, ShieldAlert, ListChecks, TrendingUp, RefreshCw } from "lucide-react";

/**
 * Dashboard AI CFO Command Center（Phase 4 八）。
 * 保持 Bento UI：展示 今日财富状态 / AI 发现问题 / 行动建议 / 财富趋势，
 * 并提供"运行主动体检"按钮触发 Monitor → Agent 协作 → 提醒 全链路。
 */
export default function BentoCommandCenter({ delay = 0 }: { delay?: number }) {
  const profile = useFinancialStore((s) => s.profile);
  const netWorth = useFinancialStore((s) => s.netWorth);
  const wealthHealthScore = useFinancialStore((s) => s.wealthHealthScore);
  const twinSnapshot = useFinancialStore((s) => s.twinSnapshot);
  const projection = useFinancialStore((s) => s.projection);
  const monitoring = useFinancialStore((s) => s.monitoring);
  const isMonitoring = useFinancialStore((s) => s.isMonitoring);
  const runMonitor = useFinancialStore((s) => s.runMonitor);

  // 优先用主动监控结果，回退到既有 Twin / Advisor
  const alerts = monitoring?.alerts ?? [];
  const notifications = monitoring?.notifications ?? [];
  const actionPlan = monitoring?.actionPlan;
  const healthScore = monitoring?.healthScore ?? wealthHealthScore?.total ?? 0;
  const onTrack = monitoring?.onTrack ?? twinSnapshot?.onTrack ?? false;

  const actionItems = [
    ...(actionPlan?.weekly ?? []),
    ...(actionPlan?.monthly ?? []),
  ].slice(0, 3);

  // 财富趋势：当前净资产 vs 终值资产增长
  const firstAssets = projection[0]?.assets ?? profile.totalAssets;
  const lastAssets = projection.length ? projection[projection.length - 1].assets : profile.totalAssets;
  const growthPct = firstAssets > 0 ? ((lastAssets - firstAssets) / firstAssets) * 100 : 0;

  const topAlerts = [...alerts].sort((a, b) => sevRank(b.severity) - sevRank(a.severity)).slice(0, 3);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <GlassCard className="relative overflow-hidden p-5 h-full" glow>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-brand shadow-glow-purple">
              <Cpu className="h-5 w-5 text-white" />
            </span>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/40">
                AI CFO Command Center
              </p>
              <h3 className="text-base font-bold text-white">AI 财富指挥中心</h3>
            </div>
          </div>
          <button
            onClick={() => runMonitor({ runAgents: true })}
            disabled={isMonitoring}
            className="flex items-center gap-1.5 rounded-lg bg-brand-purple/15 px-3 py-1.5 text-[11px] text-brand-purple ring-1 ring-brand-purple/30 transition hover:bg-brand-purple/25 disabled:opacity-60"
          >
            <RefreshCw className={`h-3 w-3 ${isMonitoring ? "animate-spin" : ""}`} />
            {isMonitoring ? "体检中…" : "运行主动体检"}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* 今日财富状态 */}
          <Cell icon={<TrendingUp className="h-4 w-4" />} title="今日财富状态">
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold text-white">
                ¥{(netWorth / 10000).toFixed(0)}
              </span>
              <span className="text-[11px] text-white/40">万净资产</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded-md bg-white/[0.05] px-2 py-0.5 text-[11px] text-white/70">
                健康分 {healthScore}
              </span>
              <span
                className={`rounded-md px-2 py-0.5 text-[11px] ${
                  onTrack
                    ? "bg-emerald-500/15 text-emerald-300"
                    : "bg-amber-500/15 text-amber-300"
                }`}
              >
                {onTrack ? "退休达标" : "目标延期"}
              </span>
            </div>
          </Cell>

          {/* AI 发现问题 */}
          <Cell icon={<ShieldAlert className="h-4 w-4" />} title="AI 发现问题">
            {topAlerts.length === 0 ? (
              <p className="text-xs text-emerald-300/80">未发现异常，状态平稳。</p>
            ) : (
              <ul className="space-y-1">
                {topAlerts.map((a) => (
                  <li key={a.id} className="flex items-start gap-1.5 text-xs">
                    <span
                      className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${dotColor(a.severity)}`}
                    />
                    <span className="text-white/70">{a.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </Cell>

          {/* 行动建议 */}
          <Cell icon={<ListChecks className="h-4 w-4" />} title="行动建议">
            {actionItems.length === 0 ? (
              <p className="text-xs text-white/50">暂无待办。</p>
            ) : (
              <ul className="space-y-1">
                {actionItems.map((a) => (
                  <li key={a.id} className="text-xs text-white/70">
                    · {a.title}
                  </li>
                ))}
              </ul>
            )}
          </Cell>

          {/* 财富趋势 */}
          <Cell icon={<TrendingUp className="h-4 w-4" />} title="财富趋势">
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold text-brand-electric">
                +{growthPct.toFixed(0)}%
              </span>
              <span className="text-[11px] text-white/40">长期增长</span>
            </div>
            <p className="mt-1 text-[11px] text-white/50">
              终值 ¥{(lastAssets / 10000).toFixed(0)} 万
            </p>
          </Cell>
        </div>

        {notifications.length > 0 && (
          <div className="mt-3 rounded-xl bg-brand-purple/10 p-3 ring-1 ring-brand-purple/20">
            <div className="flex items-center gap-1.5 text-[11px] text-brand-purple mb-1">
              <ShieldAlert className="h-3 w-3" /> 主动提醒
            </div>
            <p className="text-xs text-white/70 leading-relaxed">
              {notifications[0].message}
              {notifications.length > 1 && ` ＋${notifications.length - 1} 条`}
            </p>
          </div>
        )}
      </GlassCard>
    </motion.div>
  );
}

function Cell({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-white/40">
        <span className="text-brand-electric">{icon}</span>
        {title}
      </div>
      {children}
    </div>
  );
}

function dotColor(sev: "critical" | "warn" | "info"): string {
  return sev === "critical"
    ? "bg-rose-400"
    : sev === "warn"
    ? "bg-amber-400"
    : "bg-sky-400";
}

function sevRank(s: string): number {
  return s === "critical" ? 2 : s === "warn" ? 1 : 0;
}
