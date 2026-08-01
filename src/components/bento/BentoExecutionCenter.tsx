"use client";

import { motion } from "framer-motion";
import { useFinancialStore } from "@/store/financial-store";
import GlassCard from "@/components/ui/GlassCard";
import {
  Rocket,
  CheckCircle2,
  Circle,
  Target,
  CalendarClock,
  Bell,
  RefreshCw,
  TrendingUp,
} from "lucide-react";

/**
 * Dashboard AI Wealth Command Center（Phase 5 八）。
 * 保持 Bento UI：展示 今日建议 / 待完成任务 / 目标进度 / 财富计划 / AI 提醒，
 * 并提供"运行计划"按钮触发 Copilot → Action Agent → Task System 全链路。
 */
export default function BentoExecutionCenter({ delay = 0 }: { delay?: number }) {
  const profile = useFinancialStore((s) => s.profile);
  const wealthHealthScore = useFinancialStore((s) => s.wealthHealthScore);
  const monitoring = useFinancialStore((s) => s.monitoring);
  const wealthTasks = useFinancialStore((s) => s.wealthTasks);
  const wealthPlan = useFinancialStore((s) => s.wealthPlan);
  const goalProgress = useFinancialStore((s) => s.goalProgress);
  const isPlanning = useFinancialStore((s) => s.isPlanning);
  const runPlan = useFinancialStore((s) => s.runPlan);
  const completeTask = useFinancialStore((s) => s.completeTask);
  const runReview = useFinancialStore((s) => s.runReview);

  const pending = wealthTasks.filter((t) => t.status !== "done");
  const done = wealthTasks.filter((t) => t.status === "done");
  const completedPct =
    wealthTasks.length > 0
      ? Math.round((done.length / wealthTasks.length) * 100)
      : 0;

  const suggestions = (monitoring?.briefing.topActions ?? []).slice(0, 3);
  const notifications = monitoring?.notifications ?? [];
  const healthScore = monitoring?.healthScore ?? wealthHealthScore?.total ?? 0;

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
              <Rocket className="h-5 w-5 text-white" />
            </span>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/40">
                AI Wealth Command Center
              </p>
              <h3 className="text-base font-bold text-white">AI 财富执行中心</h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => runReview("monthly")}
              className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-[11px] text-white/70 ring-1 ring-white/10 transition hover:bg-white/10"
            >
              <CalendarClock className="h-3 w-3" />
              月度复盘
            </button>
            <button
              onClick={() => runPlan("retirement", { goalLabel: `${profile.goal.retirementAge} 岁退休` })}
              disabled={isPlanning}
              className="flex items-center gap-1.5 rounded-lg bg-brand-purple/15 px-3 py-1.5 text-[11px] text-brand-purple ring-1 ring-brand-purple/30 transition hover:bg-brand-purple/25 disabled:opacity-60"
            >
              <RefreshCw className={`h-3 w-3 ${isPlanning ? "animate-spin" : ""}`} />
              {isPlanning ? "生成中…" : "运行计划"}
            </button>
          </div>
        </div>

        {/* 顶部指标 */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <Stat icon={<Target className="h-4 w-4" />} label="待办任务" value={`${pending.length}`} />
          <Stat icon={<CheckCircle2 className="h-4 w-4" />} label="已完成" value={`${done.length}`} />
          <Stat icon={<TrendingUp className="h-4 w-4" />} label="执行率" value={`${completedPct}%`} />
          <Stat icon={<Rocket className="h-4 w-4" />} label="健康分" value={`${healthScore}`} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* 待完成任务 */}
          <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] text-white/40">
              <CheckCircle2 className="h-3.5 w-3.5 text-brand-electric" /> 待完成任务
            </div>
            {pending.length === 0 ? (
              <p className="text-xs text-emerald-300/80">
                {wealthTasks.length > 0 ? "全部任务已完成 🎉" : "运行计划以生成执行任务。"}
              </p>
            ) : (
              <ul className="space-y-1.5 max-h-44 overflow-y-auto scrollbar-thin">
                {pending.slice(0, 5).map((t) => (
                  <li key={t.id} className="flex items-start gap-2">
                    <button
                      onClick={() => completeTask(t.id)}
                      className="mt-0.5 shrink-0 text-white/40 transition hover:text-emerald-300"
                      title="标记为完成"
                    >
                      <Circle className="h-4 w-4" />
                    </button>
                    <div className="min-w-0">
                      <p className="text-xs text-white/80 leading-tight">{t.title}</p>
                      <p className="text-[10px] text-white/40">
                        {t.goal} · {t.deadline ?? "无截止日"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 目标进度 */}
          <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] text-white/40">
              <Target className="h-3.5 w-3.5 text-brand-electric" /> 目标进度
            </div>
            {goalProgress.length === 0 ? (
              <p className="text-xs text-white/50">暂无目标进度数据。</p>
            ) : (
              <ul className="space-y-2">
                {goalProgress.slice(0, 3).map((g) => (
                  <li key={g.id}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-white/80">{g.label}</span>
                      <span className="text-white/50">{g.progressPct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-white/10">
                      <div
                        className="h-1.5 rounded-full bg-gradient-brand"
                        style={{ width: `${Math.min(100, g.progressPct)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* 财富计划（三档） */}
        {wealthPlan && (
          <div className="mt-4 grid grid-cols-3 gap-3">
            {[wealthPlan.short, wealthPlan.medium, wealthPlan.long].map((p) => (
              <div key={p.horizon} className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] text-brand-electric">
                  <CalendarClock className="h-3.5 w-3.5" /> {p.label}
                </div>
                <ul className="space-y-1">
                  {p.steps.slice(0, 3).map((s, i) => (
                    <li key={i} className="text-[11px] text-white/60 leading-tight">
                      · {s.title}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {/* AI 提醒 */}
        {notifications.length > 0 && (
          <div className="mt-4 rounded-xl bg-brand-purple/10 p-3 ring-1 ring-brand-purple/20">
            <div className="flex items-center gap-1.5 text-[11px] text-brand-purple mb-1">
              <Bell className="h-3 w-3" /> AI 提醒
            </div>
            <p className="text-xs text-white/70 leading-relaxed">
              {notifications[0].message}
              {notifications.length > 1 && ` ＋${notifications.length - 1} 条`}
            </p>
          </div>
        )}

        {/* 今日建议 */}
        {suggestions.length > 0 && (
          <div className="mt-3 text-[11px] text-white/40">
            今日建议：{suggestions.join(" · ")}
          </div>
        )}
      </GlassCard>
    </motion.div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-2.5 ring-1 ring-white/10">
      <div className="flex items-center gap-1 text-[10px] text-white/40">
        <span className="text-brand-electric">{icon}</span>
        {label}
      </div>
      <p className="mt-1 text-lg font-bold text-white">{value}</p>
    </div>
  );
}
