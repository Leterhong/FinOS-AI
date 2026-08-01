"use client";

import { motion } from "framer-motion";
import { useFinancialStore } from "@/store/financial-store";
import GlassCard from "@/components/ui/GlassCard";
import { Sparkles, RefreshCw, TrendingUp, ShieldAlert, ListChecks, ScanLine } from "lucide-react";
import { timeAgo } from "@/lib/time";

type Sev = "critical" | "warn" | "info";

function sevRank(s: Sev): number {
  return s === "critical" ? 2 : s === "warn" ? 1 : 0;
}

function dotColor(sev: Sev): string {
  return sev === "critical"
    ? "bg-rose-400"
    : sev === "warn"
    ? "bg-amber-400"
    : "bg-sky-400";
}

/**
 * AI CFO 今日财富简报（Phase 5.9.2 升级版 AI Insight，Phase 5.9.3 强化 AI 生成感）。
 * 三大栏目：变化发现 / 风险提醒 / 行动建议，数据来自 Monitor 结果并回退 advisorAlerts。
 * 仅在用户点击「重新分析」后由 Monitor + 多 Agent 流水线填充；无数据时引导用户运行一次体检。
 */
export default function BentoDailyBrief({ delay = 0 }: { delay?: number }) {
  const monitoring = useFinancialStore((s) => s.monitoring);
  const advisorAlerts = useFinancialStore((s) => s.advisorAlerts);
  const isMonitoring = useFinancialStore((s) => s.isMonitoring);
  const runMonitor = useFinancialStore((s) => s.runMonitor);

  const changes: string[] = monitoring?.briefing.changes ?? [];

  const rawAlerts = monitoring?.alerts ?? [];
  const topAlerts = [...rawAlerts]
    .sort((a, b) => sevRank(b.severity) - sevRank(a.severity))
    .slice(0, 3);
  const riskReminders: { id: string; title: string; severity: Sev }[] =
    topAlerts.length > 0
      ? topAlerts.map((a) => ({ id: a.id, title: a.title, severity: a.severity }))
      : advisorAlerts.slice(0, 3).map((a) => ({
          id: a.id,
          title: a.title,
          severity: a.level,
        }));

  const actionItems = [
    ...(monitoring?.actionPlan.weekly ?? []),
    ...(monitoring?.actionPlan.monthly ?? []),
  ].slice(0, 3);
  const actions: { id: string; title: string }[] =
    actionItems.length > 0
      ? actionItems.map((a) => ({ id: a.id, title: a.title }))
      : advisorAlerts.slice(0, 3).map((a) => ({ id: a.id, title: a.title }));

  const hasContent =
    changes.length > 0 || riskReminders.length > 0 || actions.length > 0;

  return (
    <GlassCard className="relative overflow-hidden p-6" glow delay={delay}>
      {/* 动态光晕 */}
      <motion.div
        className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-brand-purple/20 blur-3xl"
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand shadow-glow-purple">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-widest text-white/40">
                AI CFO 今日财富简报
              </p>
              <h3 className="text-base font-semibold text-white">今天，AI 为你重点关注</h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/40 ring-1 ring-white/10">
              <ScanLine className="h-3 w-3" />
              AI 生成
            </span>
            {monitoring && (
              <span className="text-[11px] text-white/30">
                {timeAgo(monitoring.monitoredAt)}
              </span>
            )}
          </div>
        </div>

        {!hasContent ? (
          <div className="mt-6 flex flex-col items-center justify-center rounded-xl bg-white/[0.03] py-8 text-center ring-1 ring-white/10">
            <p className="text-sm text-white/60">AI 尚未生成今日简报</p>
            <p className="mt-1 text-xs text-white/35">
              运行一次主动体检，AI CFO 将结合你的真实数据为你分析变化、风险与行动建议
            </p>
            <button
              type="button"
              onClick={() => runMonitor({ runAgents: false })}
              disabled={isMonitoring}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-gradient-brand px-4 py-2 text-xs font-medium text-white shadow-glow-blue transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw
                className={isMonitoring ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"}
              />
              {isMonitoring ? "分析中…" : "运行 AI 分析"}
            </button>
          </div>
        ) : (
          <>
            <p className="mt-4 text-[13px] leading-relaxed text-white/55">
              基于你本月的数据，AI CFO 完成了今日财富扫描，以下是需要你关注的重点：
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <BriefSection
                icon={<TrendingUp className="h-3.5 w-3.5" />}
                title="变化发现"
                accent="text-brand-electric"
              >
                {changes.length === 0 ? (
                  <EmptyHint text="暂无显著变化" />
                ) : (
                  <ul className="space-y-2">
                    {changes.map((c, i) => (
                      <li
                        key={i}
                        className="flex gap-2 text-xs leading-snug text-white/70"
                      >
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-electric" />
                        {c}
                      </li>
                    ))}
                  </ul>
                )}
              </BriefSection>

              <BriefSection
                icon={<ShieldAlert className="h-3.5 w-3.5" />}
                title="风险提醒"
                accent="text-semantic-warn"
              >
                {riskReminders.length === 0 ? (
                  <EmptyHint text="未发现风险" />
                ) : (
                  <ul className="space-y-2">
                    {riskReminders.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-start gap-2 text-xs leading-snug text-white/70"
                      >
                        <span
                          className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${dotColor(
                            r.severity
                          )}`}
                        />
                        {r.title}
                      </li>
                    ))}
                  </ul>
                )}
              </BriefSection>

              <BriefSection
                icon={<ListChecks className="h-3.5 w-3.5" />}
                title="行动建议"
                accent="text-brand-purple"
              >
                {actions.length === 0 ? (
                  <EmptyHint text="暂无待办" />
                ) : (
                  <ul className="space-y-2">
                    {actions.map((a) => (
                      <li
                        key={a.id}
                        className="flex gap-2 text-xs leading-snug text-white/70"
                      >
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand-purple" />
                        {a.title}
                      </li>
                    ))}
                  </ul>
                )}
              </BriefSection>
            </div>
            {/* Phase 7.5 #365：免责声明已在指挥中心页面统一展示一次，此处不重复 */}
          </>
        )}
      </div>
    </GlassCard>
  );
}

function BriefSection({
  icon,
  title,
  accent,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-white/50">
        <span className={accent}>{icon}</span>
        {title}
      </div>
      {children}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-[11px] text-white/30">{text}</p>;
}
