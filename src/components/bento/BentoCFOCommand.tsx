"use client";

import { motion } from "framer-motion";
import { useFinancialStore } from "@/store/financial-store";
import GlassCard from "@/components/ui/GlassCard";
import { timeAgo } from "@/lib/time";
import {
  Radar,
  Bell,
  Activity,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Coins,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Sev = "critical" | "warn" | "info";

function sevColor(sev: Sev): string {
  return sev === "critical"
    ? "text-rose-400"
    : sev === "warn"
      ? "text-amber-400"
      : "text-sky-400";
}
function sevBg(sev: Sev): string {
  return sev === "critical"
    ? "bg-rose-400/10 ring-rose-400/20"
    : sev === "warn"
      ? "bg-amber-400/10 ring-amber-400/20"
      : "bg-sky-400/10 ring-sky-400/20";
}

/**
 * Dashboard AI CFO 主动管家状态卡（Phase 6.8 需求六 / 十一）。
 * 聚合：主动提醒开关与频率、最近一次体检摘要（事件 / 推送 / 抑制 / AI 调用次数）、
 * 未读通知数，并提供「运行体检」入口与通往财富监控中心的快捷链接。
 */
export default function BentoCFOCommand({ delay = 0 }: { delay?: number }) {
  const settings = useFinancialStore((s) => s.proactiveSettings);
  const result = useFinancialStore((s) => s.proactiveResult);
  const unread = useFinancialStore((s) => s.proactiveUnread);
  const notifications = useFinancialStore((s) => s.proactiveNotifications);
  const schedule = useFinancialStore((s) => s.proactiveSchedule);
  const isRunning = useFinancialStore((s) => s.isProactiveRunning);
  const runProactiveMonitor = useFinancialStore((s) => s.runProactiveMonitor);
  const wealthHealthScore = useFinancialStore((s) => s.wealthHealthScore);

  const enabled = settings?.enabled ?? true;
  const frequency = settings?.frequency ?? "daily";

  // 健康分：优先本次体检结果，回退全局 Twin 健康分
  const healthScore =
    result?.monitoring.healthScore ?? wealthHealthScore?.total ?? null;

  const events = result?.events ?? [];
  const criticalCount = events.filter((e) => e.severity === "critical").length;
  const warnCount = events.filter((e) => e.severity === "warn").length;
  const pushedCount = result?.notifications.length ?? 0;
  const suppressed = result?.suppressed ?? 0;
  const aiCalls = result?.aiCalls ?? 0;
  const budgetBlocked = result?.budgetBlocked ?? false;

  const lastRunAt = result?.ranAt ?? null;
  const dueDaily = schedule?.dueDaily ?? false;
  const dueWeekly = schedule?.dueWeekly ?? false;

  return (
    <GlassCard className="relative overflow-hidden p-6" glow delay={delay}>
      {/* 动态光晕 */}
      <motion.div
        className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-brand-electric/15 blur-3xl"
        animate={{ scale: [1, 1.15, 1], opacity: [0.25, 0.4, 0.25] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand shadow-glow-blue">
              <Radar className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-widest text-white/40">
                AI CFO 主动管家
              </p>
              <h3 className="text-base font-semibold text-white">
                财富健康监控中心
              </h3>
            </div>
          </div>
          {unread > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-400/15 px-2 py-0.5 text-[10px] font-medium text-rose-300 ring-1 ring-rose-400/30">
              <Bell className="h-3 w-3" />
              {unread} 条未读
            </span>
          )}
        </div>

        {/* 状态行：开启 / 频率 / 下次到期 */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] ring-1",
              enabled
                ? "bg-emerald-400/10 text-emerald-300 ring-emerald-400/20"
                : "bg-white/[0.04] text-white/40 ring-white/10"
            )}
          >
            {enabled ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                主动提醒已开启
              </>
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
                主动提醒已关闭
              </>
            )}
          </span>
          <span className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/50 ring-1 ring-white/10">
            {frequency === "off"
              ? "不自动体检"
              : frequency === "weekly"
                ? "每周体检"
                : "每日体检"}
          </span>
          {(dueDaily || dueWeekly) && (
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-electric/10 px-2.5 py-1 text-[11px] text-brand-electric ring-1 ring-brand-electric/20">
              <Activity className="h-3 w-3" />
              有体检待执行
            </span>
          )}
        </div>

        {/* 核心指标 */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Metric
            label="健康分"
            value={healthScore != null ? String(healthScore) : "—"}
            icon={<ShieldCheck className="h-3.5 w-3.5" />}
            accent="text-semantic-success"
          />
          <Metric
            label="风险事件"
            value={String(criticalCount + warnCount)}
            icon={
              criticalCount > 0 ? (
                <ShieldAlert className="h-3.5 w-3.5" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" />
              )
            }
            accent={
              criticalCount > 0
                ? "text-rose-400"
                : warnCount > 0
                  ? "text-amber-400"
                  : "text-white/70"
            }
          />
          <Metric
            label="推送提醒"
            value={String(pushedCount)}
            icon={<Bell className="h-3.5 w-3.5" />}
            accent="text-white/70"
          />
        </div>

        {/* 上次体检摘要 */}
        {lastRunAt && (
          <div className="mt-4 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
            <div className="flex items-center justify-between text-[11px] text-white/40">
              <span>上次体检 {timeAgo(lastRunAt)}</span>
              <span className="inline-flex items-center gap-1 text-white/50">
                <Coins className="h-3 w-3" />
                {aiCalls} 次 AI 调用
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className={cn("rounded px-1.5 py-0.5 ring-1", sevBg("critical"))}>
                <span className={sevColor("critical")}>{criticalCount} 严重</span>
              </span>
              <span className={cn("rounded px-1.5 py-0.5 ring-1", sevBg("warn"))}>
                <span className={sevColor("warn")}>{warnCount} 警告</span>
              </span>
              {suppressed > 0 && (
                <span className="rounded bg-white/[0.04] px-1.5 py-0.5 text-white/40 ring-1 ring-white/10">
                  {suppressed} 条已抑制
                </span>
              )}
              {budgetBlocked && (
                <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-amber-300 ring-1 ring-amber-400/20">
                  预算受限降级
                </span>
              )}
            </div>
          </div>
        )}

        {/* 操作行 */}
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => runProactiveMonitor()}
            disabled={isRunning}
            className="inline-flex items-center gap-2 rounded-full border border-brand-electric/30 bg-brand-electric/10 px-4 py-2 text-xs font-medium text-brand-electric transition hover:bg-brand-electric/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Radar className={isRunning ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
            {isRunning ? "体检中…" : "运行主动体检"}
          </button>
          <a
            href="/wealth-monitor"
            className="inline-flex items-center gap-1 text-xs text-white/50 transition hover:text-white/80"
          >
            进入监控中心
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>

        {/* 最近未读提醒预览 */}
        {notifications.filter((n) => !n.read && !n.dismissed).length > 0 && (
          <div className="mt-3 space-y-1.5">
            {notifications
              .filter((n) => !n.read && !n.dismissed)
              .slice(0, 2)
              .map((n) => (
                <div
                  key={n.id}
                  className="flex items-start gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5 ring-1 ring-white/10"
                >
                  <span
                    className={cn(
                      "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                      n.severity === "critical"
                        ? "bg-rose-400"
                        : n.severity === "warn"
                          ? "bg-amber-400"
                          : "bg-sky-400"
                    )}
                  />
                  <p className="text-[11px] leading-snug text-white/70">{n.title}</p>
                </div>
              ))}
          </div>
        )}

        {/* Phase 7.5 #365：免责声明已在指挥中心页面统一展示一次，此处不重复 */}
      </div>
    </GlassCard>
  );
}

function Metric({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-2.5 ring-1 ring-white/10">
      <p className="flex items-center gap-1 text-[10px] text-white/40">
        <span className="text-white/50">{icon}</span>
        {label}
      </p>
      <p className={cn("mt-1 text-xl font-bold", accent)}>{value}</p>
    </div>
  );
}
