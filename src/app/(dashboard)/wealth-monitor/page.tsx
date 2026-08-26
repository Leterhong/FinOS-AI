"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import PageTransition from "@/components/dashboard/PageTransition";
import GlassCard from "@/components/ui/GlassCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useFinancialStore } from "@/store/financial-store";
import { formatCurrency, cn } from "@/lib/utils";
import { timeAgo } from "@/lib/time";
import {
  Radar,
  Bell,
  Check,
  X,
  Settings2,
  Sparkles,
  ListChecks,
  ShieldAlert,
  Coins,
  Activity,
  FlaskConical,
  ArrowRight,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import type {
  FinancialEventType,
  AlertSeverity,
  NotificationCategory,
} from "@/ai/monitoring";
import type {
  AdviceTier,
  LifeEventType,
  LifeEventInput,
  LifeEventResult,
  ProactiveSettings,
  ProactiveNotification,
} from "@/ai/proactive";

// ── 展示用中文标签（避免客户端引入 server-only 模块） ─────────────────────
const EVENT_LABELS: Record<FinancialEventType, string> = {
  "income-drop": "收入下降",
  "expense-increase": "支出增加",
  "savings-rate-drop": "储蓄率下降",
  "asset-drop": "资产下降",
  "risk-increase": "风险提升",
  "goal-delay": "目标延期",
  "emergency-fund-low": "应急金不足",
  "allocation-deviation": "资产配置偏离",
  "insurance-gap": "保障缺口",
  "expense-consecutive": "连续多月支出上升",
  "investment-concentration": "投资过度集中",
};

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  wealth: "财富",
  risk: "风险",
  goal: "目标",
  opportunity: "机会",
};

const LIFE_EVENT_LABELS: Record<LifeEventType, string> = {
  "buy-house": "买房",
  marriage: "结婚",
  childbirth: "生子",
  "start-business": "创业",
  "job-change": "换工作",
  retirement: "退休",
};

const FOCUS_OPTIONS: NotificationCategory[] = [
  "wealth",
  "risk",
  "goal",
  "opportunity",
];

function severityTone(sev: AlertSeverity): "error" | "warn" | "info" {
  return sev === "critical" ? "error" : sev === "warn" ? "warn" : "info";
}

function tierBadge(tier: AdviceTier) {
  if (tier === "local")
    return <StatusBadge tone="neutral">本地规则生成</StatusBadge>;
  if (tier === "light")
    return <StatusBadge tone="info">轻量模型生成</StatusBadge>;
  return <StatusBadge tone="success">深度分析模型生成</StatusBadge>;
}

export default function WealthMonitorPage() {
  const profile = useFinancialStore((s) => s.profile);
  const profileStatus = useFinancialStore((s) => s.profileStatus);
  const result = useFinancialStore((s) => s.proactiveResult);
  const isRunning = useFinancialStore((s) => s.isProactiveRunning);
  const runProactiveMonitor = useFinancialStore((s) => s.runProactiveMonitor);
  const notifications = useFinancialStore((s) => s.proactiveNotifications);
  const proactiveUnread = useFinancialStore((s) => s.proactiveUnread);
  const markNotification = useFinancialStore((s) => s.markNotification);
  const markAllNotificationsRead = useFinancialStore(
    (s) => s.markAllNotificationsRead
  );
  const settings = useFinancialStore((s) => s.proactiveSettings);
  const saveProactiveSettings = useFinancialStore((s) => s.saveProactiveSettings);

  useEffect(() => {
    // 进入页面若尚未体检，主动拉取一次通知（保持中心数据新鲜）
    if (profileStatus === "loaded") {
      useFinancialStore.getState().loadProactiveNotifications();
    }
  }, [profileStatus]);

  const healthScore = result?.monitoring.healthScore ?? null;
  const netWorth = result?.monitoring.netWorth ?? null;
  const events = result?.events ?? [];
  const criticalCount = events.filter((e) => e.severity === "critical").length;
  const warnCount = events.filter((e) => e.severity === "warn").length;
  const advice = result?.advice ?? null;
  const actionPlan = result?.monitoring.actionPlan;

  return (
    <PageTransition>
      <div className="space-y-7">
        {/* ── 页头 ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-wrap items-end justify-between gap-4"
        >
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-brand shadow-glow-blue">
                <Radar className="h-4 w-4 text-white" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-white">
                财富健康监控中心
              </h1>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-white/55">
              AI CFO 主动监控你的真实财富数据：自动识别收入、支出、风险与目标偏差，
              在关键变化发生时主动提醒你，并结合你的退休目标与风险偏好给出可执行建议。
            </p>
          </div>
          <div className="flex items-center gap-3">
            {result?.ranAt && (
              <span className="text-[11px] text-white/35">
                上次体检 {timeAgo(result.ranAt)}
              </span>
            )}
            <button
              type="button"
              onClick={() => runProactiveMonitor()}
              disabled={isRunning || profileStatus !== "loaded"}
              className="inline-flex items-center gap-2 rounded-full border border-brand-electric/30 bg-brand-electric/10 px-4 py-2 text-xs font-medium text-brand-electric transition hover:bg-brand-electric/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Radar className={isRunning ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
              {isRunning ? "体检中…" : "运行主动体检"}
            </button>
          </div>
        </motion.div>

        {/* 无真实数据 / 未体检时的空态引导 */}
        {profileStatus !== "loaded" ? (
          <GlassCard className="p-10 text-center">
            <Radar className="mx-auto h-8 w-8 text-white/20" />
            <p className="mt-3 text-sm text-white/60">
              请先完善你的财富档案，AI CFO 才能开始主动监控。
            </p>
          </GlassCard>
        ) : !result ? (
          <GlassCard className="p-10 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-brand shadow-glow-blue">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <p className="mt-4 text-base font-medium text-white">
              你的 AI CFO 主动管家已就绪
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
              点击「运行主动体检」，AI CFO 将扫描你的收入、支出、资产、风险与目标进度，
              识别异常事件并给出分级建议。无异常变化时不触发任何 AI 调用，零成本。
            </p>
            <button
              type="button"
              onClick={() => runProactiveMonitor()}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-brand px-5 py-2.5 text-sm font-medium text-white shadow-glow-blue transition hover:opacity-90"
            >
              <Radar className="h-4 w-4" /> 立即运行一次体检
            </button>
          </GlassCard>
        ) : (
          <>
            {/* ── 概览指标 ── */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <OverviewCard
                label="财富健康分"
                value={healthScore != null ? String(healthScore) : "—"}
                icon={<Activity className="h-4 w-4" />}
                accent="text-semantic-success"
              />
              <OverviewCard
                label="净资产"
                value={netWorth != null ? formatCurrency(netWorth) : "—"}
                icon={<Coins className="h-4 w-4" />}
                accent="text-white"
              />
              <OverviewCard
                label="风险事件"
                value={`${criticalCount + warnCount}`}
                sub={`${criticalCount} 严重 · ${warnCount} 警告`}
                icon={<ShieldAlert className="h-4 w-4" />}
                accent={
                  criticalCount > 0
                    ? "text-rose-400"
                    : warnCount > 0
                      ? "text-amber-400"
                      : "text-white/70"
                }
              />
              <OverviewCard
                label="本次 AI 调用"
                value={`${result.aiCalls}`}
                sub={result.budgetBlocked ? "预算受限已降级" : "成本控制达标"}
                icon={<Sparkles className="h-4 w-4" />}
                accent="text-white/70"
              />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* 事件监测 */}
              <Section
                title="事件监测"
                icon={<Radar className="h-4 w-4" />}
                hint={`共识别 ${events.length} 个事件`}
              >
                {events.length === 0 ? (
                  <EmptyHint text="未发现异常事件，你的财富状态稳定。" />
                ) : (
                  <ul className="space-y-2.5">
                    {events.map((e) => (
                      <li
                        key={e.id}
                        className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <StatusBadge tone={severityTone(e.severity)}>
                              {EVENT_LABELS[e.type] ?? e.type}
                            </StatusBadge>
                            <span className="text-[11px] text-white/40">
                              {timeAgo(e.detectedAt)}
                            </span>
                          </div>
                          {(e.changePct != null || e.before != null) && (
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 text-[11px]",
                                (e.changePct ?? 0) >= 0
                                  ? "text-rose-400"
                                  : "text-semantic-success"
                              )}
                            >
                              {(e.changePct ?? 0) >= 0 ? (
                                <TrendingUp className="h-3 w-3" />
                              ) : (
                                <TrendingDown className="h-3 w-3" />
                              )}
                              {e.changePct != null
                                ? `${e.changePct > 0 ? "+" : ""}${e.changePct.toFixed(1)}%`
                                : ""}
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-sm font-medium text-white">
                          {e.title}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-white/55">
                          {e.message}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {/* 分级 AI 建议 */}
              <Section
                title="AI CFO 分级建议"
                icon={<Sparkles className="h-4 w-4" />}
                hint={
                  advice
                    ? `${advice.usedLLM ? "已调用模型" : "本地规则"} · 个性化 ${advice.personalized ? "已开启" : "未开启"}`
                    : "无异常"
                }
              >
                {!advice ? (
                  <EmptyHint text="当前无触发 AI 建议的事件，AI CFO 保持静默以节省成本。" />
                ) : (
                  <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/10">
                    <div className="flex flex-wrap items-center gap-2">
                      {tierBadge(advice.tier)}
                      {advice.usedLLM ? (
                        <StatusBadge tone="info">调用了 LLM</StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral">未调用 LLM</StatusBadge>
                      )}
                      {advice.personalized && (
                        <StatusBadge tone="success">结合你的目标与偏好</StatusBadge>
                      )}
                    </div>
                    {advice.degradeReason && (
                      <p className="mt-2 text-[11px] text-amber-300">
                        降级原因：{advice.degradeReason}
                      </p>
                    )}
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-white/75">
                      {advice.text}
                    </p>
                  </div>
                )}
              </Section>
            </div>

            {/* 行动计划 */}
            <Section
              title="财富行动计划"
              icon={<ListChecks className="h-4 w-4" />}
              hint="来自本次体检的 Action Plan"
            >
              {!actionPlan ||
              (actionPlan.weekly.length === 0 &&
                actionPlan.monthly.length === 0 &&
                actionPlan.yearly.length === 0) ? (
                <EmptyHint text="暂无待办行动计划。" />
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <PlanColumn title="本周" items={actionPlan.weekly} />
                  <PlanColumn title="本月" items={actionPlan.monthly} />
                  <PlanColumn title="年度" items={actionPlan.yearly} />
                </div>
              )}
            </Section>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* 通知中心 */}
              <Section
                title="通知中心"
                icon={<Bell className="h-4 w-4" />}
                hint={
                  proactiveUnread > 0 ? `${proactiveUnread} 条未读` : "全部已读"
                }
                action={
                  proactiveUnread > 0 ? (
                    <button
                      type="button"
                      onClick={() => markAllNotificationsRead()}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-emerald-300 transition hover:bg-emerald-400/10"
                    >
                      <Check className="h-3 w-3" /> 全部已读
                    </button>
                  ) : undefined
                }
              >
                {notifications.filter((n) => !n.dismissed).length === 0 ? (
                  <EmptyHint text="暂无主动提醒。" />
                ) : (
                  <ul className="space-y-2">
                    {notifications
                      .filter((n) => !n.dismissed)
                      .slice(0, 12)
                      .map((n) => (
                        <NotificationRow
                          key={n.id}
                          n={n}
                          onRead={() => markNotification(n.id, { read: true })}
                          onDismiss={() =>
                            markNotification(n.id, { dismissed: true, read: true })
                          }
                        />
                      ))}
                  </ul>
                )}
              </Section>

              {/* 主动提醒设置 */}
              <Section
                title="主动提醒设置"
                icon={<Settings2 className="h-4 w-4" />}
                hint="你完全掌控 AI CFO 的主动程度"
              >
                {settings ? (
                  <SettingsPanel
                    settings={settings}
                    onSave={(patch) => saveProactiveSettings(patch)}
                  />
                ) : (
                  <EmptyHint text="设置加载中…" />
                )}
              </Section>
            </div>

            {/* 人生事件模拟 */}
            <LifeEventSimulator profileName={profile.name} />
          </>
        )}
      </div>
    </PageTransition>
  );
}

// ── 子组件 ────────────────────────────────────────────────────────────────

function OverviewCard({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <GlassCard className="p-4">
      <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-white/40">
        <span className="text-white/50">{icon}</span>
        {label}
      </p>
      <p className={cn("mt-1 text-2xl font-bold tracking-tight", accent)}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-white/40">{sub}</p>}
    </GlassCard>
  );
}

function Section({
  title,
  icon,
  hint,
  action,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <GlassCard className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-brand-electric">{icon}</span>
          <h2 className="text-sm font-semibold text-white">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {hint && <span className="text-[11px] text-white/35">{hint}</span>}
          {action}
        </div>
      </div>
      {children}
    </GlassCard>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-xl bg-white/[0.02] py-8 text-center text-sm text-white/40 ring-1 ring-white/10">
      {text}
    </div>
  );
}

function PlanColumn({
  title,
  items,
}: {
  title: string;
  items: { id: string; title: string; detail?: string; rationale?: string }[];
}) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-white/40">
        {title}
      </p>
      {items.length === 0 ? (
        <p className="text-[11px] text-white/30">无</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.id} className="text-xs leading-snug text-white/70">
              <span className="text-brand-electric">· </span>
              {it.title}
              {it.detail && (
                <span className="mt-0.5 block text-[10px] text-white/40">
                  {it.detail}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotificationRow({
  n,
  onRead,
  onDismiss,
}: {
  n: ProactiveNotification;
  onRead: () => void;
  onDismiss: () => void;
}) {
  return (
    <li
      className={cn(
        "flex gap-2.5 rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/10",
        !n.read && "bg-white/[0.05]"
      )}
    >
      <span
        className={cn(
          "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
          n.severity === "critical"
            ? "bg-rose-400"
            : n.severity === "warn"
              ? "bg-amber-400"
              : "bg-sky-400"
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={cn("text-xs font-medium", n.read ? "text-white/60" : "text-white/90")}>
            {n.title}
          </p>
          <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/40">
            {CATEGORY_LABELS[n.category] ?? n.category}
          </span>
        </div>
        {n.reason && (
          <p className="mt-1 text-[11px] leading-snug text-white/50">{n.reason}</p>
        )}
        {n.suggestion && (
          <p className="mt-1 text-[11px] leading-snug text-brand-electric/80">
            建议：{n.suggestion}
          </p>
        )}
        <div className="mt-1.5 flex items-center gap-3 text-[10px] text-white/30">
          <span>{timeAgo(n.createdAt)}</span>
          {!n.read && (
            <button
              type="button"
              onClick={onRead}
              className="text-emerald-300/80 transition hover:text-emerald-300"
            >
              标为已读
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex items-center gap-0.5 text-white/40 transition hover:text-white/70"
          >
            <X className="h-2.5 w-2.5" /> 忽略
          </button>
        </div>
      </div>
    </li>
  );
}

function SettingsPanel({
  settings,
  onSave,
}: {
  settings: ProactiveSettings;
  onSave: (patch: Partial<ProactiveSettings>) => void;
}) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [frequency, setFrequency] = useState(settings.frequency);
  const [focusAreas, setFocusAreas] = useState<NotificationCategory[]>(
    settings.focusAreas
  );
  const [suppressLow, setSuppressLow] = useState(settings.suppressLowPriority);

  const dirty =
    enabled !== settings.enabled ||
    frequency !== settings.frequency ||
    suppressLow !== settings.suppressLowPriority ||
    focusAreas.length !== settings.focusAreas.length ||
    !focusAreas.every((a) => settings.focusAreas.includes(a));

  const toggleFocus = (c: NotificationCategory) => {
    setFocusAreas((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  };

  const save = () => {
    onSave({
      enabled,
      frequency,
      focusAreas,
      suppressLowPriority: suppressLow,
    });
  };

  return (
    <div className="space-y-4">
      <ToggleRow
        label="主动提醒总开关"
        desc="关闭后 AI CFO 完全静默，不再主动推送任何提醒"
        checked={enabled}
        onChange={setEnabled}
      />
      <div>
        <p className="text-xs font-medium text-white/70">体检频率</p>
        <div className="mt-2 flex gap-2">
          {(["daily", "weekly", "off"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFrequency(f)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs transition",
                frequency === f
                  ? "border-brand-electric/40 bg-brand-electric/10 text-brand-electric"
                  : "border-white/10 bg-white/[0.03] text-white/50 hover:text-white/80"
              )}
            >
              {f === "daily" ? "每日" : f === "weekly" ? "每周" : "关闭"}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-medium text-white/70">关注领域</p>
        <p className="mt-0.5 text-[11px] text-white/40">
          仅推送以下类别的提醒，避免无关打扰
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {FOCUS_OPTIONS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => toggleFocus(c)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs transition",
                focusAreas.includes(c)
                  ? "border-brand-electric/40 bg-brand-electric/10 text-brand-electric"
                  : "border-white/10 bg-white/[0.03] text-white/40 hover:text-white/70"
              )}
            >
              {CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
      </div>
      <ToggleRow
        label="抑制低价值提醒"
        desc="low 优先级提醒不推送，仅在重要变化时通知你"
        checked={suppressLow}
        onChange={setSuppressLow}
      />
      <button
        type="button"
        onClick={save}
        disabled={!dirty}
        className="w-full rounded-xl bg-gradient-brand py-2 text-xs font-medium text-white shadow-glow-blue transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {dirty ? "保存设置" : "设置已是最新"}
      </button>
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-xs font-medium text-white/70">{label}</p>
        <p className="mt-0.5 text-[11px] text-white/40">{desc}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-brand-electric/70" : "bg-white/10"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform",
            checked ? "translate-x-5" : "translate-x-0.5"
          )}
        />
      </button>
    </div>
  );
}

function LifeEventSimulator({ profileName }: { profileName: string }) {
  const [type, setType] = useState<LifeEventType>("buy-house");
  const [params, setParams] = useState<Record<string, string>>({});
  const [simulating, setSimulating] = useState(false);
  const [result, setResult] = useState<LifeEventResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setSimulating(true);
    setError(null);
    try {
      const parsedParams: LifeEventInput["params"] = {};
      const numKeys: Record<LifeEventType, (keyof NonNullable<LifeEventInput["params"]>)[]> = {
        "buy-house": ["downPayment", "monthlyMortgage"],
        marriage: [],
        childbirth: [],
        "start-business": ["startupCapital"],
        "job-change": ["newMonthlySalary"],
        retirement: ["retireAge"],
      };
      for (const k of numKeys[type]) {
        const raw = params[k];
        if (raw !== undefined && raw.trim() !== "" && !isNaN(Number(raw))) {
          (parsedParams as Record<string, number>)[k] = Number(raw);
        }
      }
      const res = await fetch(`/api/ai/proactive/life-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, params: parsedParams }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "模拟失败");
        return;
      }
      setResult(data.result as LifeEventResult);
    } catch {
      setError("网络错误，请重试");
    } finally {
      setSimulating(false);
    }
  };

  const paramLabels: Partial<Record<LifeEventType, { key: string; label: string; placeholder: string }[]>> = {
    "buy-house": [
      { key: "downPayment", label: "首付金额", placeholder: "如 600000" },
      { key: "monthlyMortgage", label: "月供", placeholder: "如 12000" },
    ],
    "job-change": [{ key: "newMonthlySalary", label: "新月薪", placeholder: "如 30000" }],
    "start-business": [{ key: "startupCapital", label: "创业投入", placeholder: "如 200000" }],
    retirement: [{ key: "retireAge", label: "目标退休年龄", placeholder: "如 55" }],
  };

  return (
    <Section
      title="人生事件模拟沙盘"
      icon={<FlaskConical className="h-4 w-4" />}
      hint="只读推演，不修改真实财富档案"
    >
      <div className="space-y-4">
        <p className="text-xs text-white/45">
          选择一个人生事件，AI CFO 会在沙盘中推演它对你财务健康、退休目标与现金流的影响。
        </p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(LIFE_EVENT_LABELS) as LifeEventType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setType(t);
                setResult(null);
                setParams({});
              }}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs transition",
                type === t
                  ? "border-brand-electric/40 bg-brand-electric/10 text-brand-electric"
                  : "border-white/10 bg-white/[0.03] text-white/50 hover:text-white/80"
              )}
            >
              {LIFE_EVENT_LABELS[t]}
            </button>
          ))}
        </div>

        {paramLabels[type] && (
          <div className="grid grid-cols-2 gap-3">
            {paramLabels[type]!.map((p) => (
              <div key={p.key}>
                <label className="text-[11px] text-white/45">{p.label}</label>
                <input
                  value={params[p.key] ?? ""}
                  onChange={(e) =>
                    setParams((prev) => ({ ...prev, [p.key]: e.target.value }))
                  }
                  placeholder={p.placeholder}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white outline-none transition focus:border-brand-electric/40"
                />
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={run}
          disabled={simulating}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-brand px-4 py-2 text-xs font-medium text-white shadow-glow-blue transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FlaskConical className={simulating ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          {simulating ? "推演中…" : `模拟「${LIFE_EVENT_LABELS[type]}」影响`}
        </button>

        {error && (
          <p className="text-[11px] text-rose-300">{error}</p>
        )}

        {result && <LifeEventResultView result={result} profileName={profileName} />}
      </div>
    </Section>
  );
}

function LifeEventResultView({
  result,
  profileName,
}: {
  result: LifeEventResult;
  profileName: string;
}) {
  const metricRows: {
    label: string;
    before: number;
    after: number;
    better: (b: number, a: number) => boolean;
    fmt?: (n: number) => string;
  }[] = [
    {
      label: "财富健康分",
      before: result.before.healthScore,
      after: result.after.healthScore,
      better: (b, a) => a >= b,
    },
    {
      label: "净资产",
      before: result.before.netWorth,
      after: result.after.netWorth,
      better: (b, a) => a >= b,
      fmt: (n) => formatCurrency(n),
    },
    {
      label: "月储蓄",
      before: result.before.monthlySavings,
      after: result.after.monthlySavings,
      better: (b, a) => a >= b,
      fmt: (n) => formatCurrency(n),
    },
    {
      label: "预计退休年龄",
      before: result.before.projectedRetireAge,
      after: result.after.projectedRetireAge,
      // 退休年龄越早（数值越小）越好
      better: (b, a) => a <= b,
      fmt: (n) => `${n} 岁`,
    },
  ];

  return (
    <div className="mt-2 rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/10">
      <div className="flex items-center gap-2">
        <StatusBadge tone={result.after.onTrack ? "success" : "warn"}>
          {result.after.onTrack ? "退休目标仍可达成" : "退休目标出现偏差"}
        </StatusBadge>
        <span className="text-[11px] text-white/40">
          {LIFE_EVENT_LABELS[result.type]} 推演 · {profileName || "你"}
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {metricRows.map((m) => {
          const improved = m.better(m.before, m.after);
          return (
            <div
              key={m.label}
              className="flex items-center justify-between text-xs"
            >
              <span className="text-white/50">{m.label}</span>
              <span className="flex items-center gap-2">
                <span className="text-white/40">
                  {m.fmt ? m.fmt(m.before) : m.before}
                </span>
                <ArrowRight className="h-3 w-3 text-white/30" />
                <span
                  className={cn(
                    "font-medium",
                    improved ? "text-semantic-success" : "text-rose-400"
                  )}
                >
                  {m.fmt ? m.fmt(m.after) : m.after}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      {result.deltas.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-medium text-white/50">关键变化</p>
          <ul className="mt-1 space-y-1">
            {result.deltas.map((d, i) => (
              <li key={i} className="text-[11px] leading-snug text-white/60">
                · {d}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.analysis.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-medium text-white/50">AI CFO 分析</p>
          <ul className="mt-1 space-y-1">
            {result.analysis.map((a, i) => (
              <li key={i} className="text-[11px] leading-snug text-brand-electric/80">
                · {a}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
