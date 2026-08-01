"use client";

import { useState, type ReactNode, type ComponentType } from "react";
import Link from "next/link";
import {
  Workflow,
  Zap,
  Bot,
  Calendar,
  GitBranch,
  Play,
  Plus,
  Trash2,
  Check,
  X,
  Clock,
  AlertTriangle,
  Sparkles,
  Target,
  RefreshCw,
  Cpu,
  Activity,
  TrendingUp,
  TrendingDown,
  Eye,
  Info,
  Loader2,
  ChevronRight,
  ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";
import {
  useAutonomousOverview,
  useBootstrapAutomation,
  useScanAutomation,
  useAutonomousEvents,
  useAutonomousRuns,
  useRules,
  useCreateRule,
  useUpdateRule,
  useDeleteRule,
  useRunRule,
  useSchedules,
  useCreateSchedule,
  useUpdateSchedule,
  useDeleteSchedule,
  useRunSchedule,
  useWorkflows,
  useWorkflowTemplates,
  useCreateWorkflow,
  useDeleteWorkflow,
  useRunAutoWorkflow,
  useActions,
  useActionStats,
  useCreateAction,
  useCompleteAction,
  useDismissAction,
  useDeferAction,
  useReopenAction,
  useDeleteAction,
  usePlans,
  useCreatePlan,
  useDeletePlan,
  useRunPlan,
  usePreferences,
  useLearnPreferences,
  usePreferenceBias,
  useMarketPrice,
  usePortfolioChange,
} from "@/hooks/use-backend";
import type {
  Severity,
  ActionStatus,
  AutomationRule,
  AutomationSchedule,
  AutomationWorkflow,
  AutomationWebhook,
  AutomationPlan,
  AutomationAction,
  WorkflowTemplate,
} from "@/types/autonomous";

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: "bg-red-500/15 text-red-300 border-red-500/30",
  high: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  medium: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  low: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};
const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "紧急",
  high: "重要",
  medium: "一般",
  low: "提示",
};
const STATUS_LABEL: Record<ActionStatus, string> = {
  pending: "待处理",
  done: "已完成",
  dismissed: "已忽略",
  deferred: "已延期",
};
const STATUS_STYLE: Record<ActionStatus, string> = {
  pending: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  done: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  dismissed: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  deferred: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

function Section({
  title,
  icon: Icon,
  desc,
  children,
  action,
  className,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  desc?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-white/8 bg-white/[0.03] p-5", className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-electric/10 text-brand-electric">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">{title}</h2>
            {desc && <p className="text-xs text-white/40">{desc}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Toggle({
  on,
  onChange,
  disabled,
}: {
  on: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative h-5 w-9 rounded-full transition-colors",
        on ? "bg-brand-electric/70" : "bg-white/15",
        disabled && "opacity-50",
      )}
      aria-label="切换启用"
    >
      <span
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
          on ? "left-[18px]" : "left-0.5",
        )}
      />
    </button>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-white/5", className)} />;
}

export default function AutomationsPage() {
  const { toast, Toast } = useToast();
  const { data: ov, isLoading } = useAutonomousOverview();
  const bootstrap = useBootstrapAutomation();
  const scan = useScanAutomation();
  const learn = useLearnPreferences();

  const onBootstrap = () =>
    bootstrap.mutate(undefined, {
      onSuccess: (r) => toast(`引擎已初始化：${r?.message ?? "完成"}`),
      onError: (e) => toast(`初始化失败：${(e as Error).message}`),
    });
  const onScan = () =>
    scan.mutate(
      { runWorkflows: true },
      {
        onSuccess: (r) => toast(r?.message ?? "扫描完成"),
        onError: (e) => toast(`扫描失败：${(e as Error).message}`),
      },
    );
  const onLearn = () =>
    learn.mutate(undefined, {
      onSuccess: () => toast("偏好学习完成"),
      onError: (e) => toast(`学习失败：${(e as Error).message}`),
    });

  return (
    <div className="space-y-6">
      {Toast}
      {/* 头部 */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-brand-electric">
            <Zap className="h-5 w-5" />
            <span className="text-sm font-medium uppercase tracking-widest">Autonomous OS</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-white">智能自动化中心</h1>
          <p className="mt-1 text-sm text-white/50">
            AI 主动监测你的财富变化、自动执行任务、并把建议落成可处理的行动项。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={bootstrap.isPending}
            onClick={onBootstrap}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/[0.08] disabled:opacity-50"
          >
            {bootstrap.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            初始化引擎
          </button>
          <button
            type="button"
            disabled={scan.isPending}
            onClick={onScan}
            className="flex items-center gap-2 rounded-xl bg-brand-electric px-4 py-2.5 text-sm font-semibold text-[#04140f] transition hover:opacity-90 disabled:opacity-50"
          >
            {scan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            立即扫描
          </button>
          <button
            type="button"
            disabled={learn.isPending}
            onClick={onLearn}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-white/[0.08] disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            偏好学习
          </button>
        </div>
      </div>

      {isLoading ? (
        <Section title="AI 控制中心" icon={Cpu} desc="加载中…">
          <Skeleton className="h-24 w-full" />
        </Section>
      ) : !ov ? (
        <Section title="AI 控制中心" icon={Cpu}>
          <p className="text-sm text-white/50">暂时无法连接自动化引擎，请稍后重试。</p>
        </Section>
      ) : (
        <>
          {/* 新用户零数据欢迎态 */}
          {!ov.hasData && (
            <div className="rounded-2xl border border-brand-electric/20 bg-brand-electric/[0.06] p-6 text-center">
              <Bot className="mx-auto h-10 w-10 text-brand-electric" />
              <h2 className="mt-3 text-lg font-semibold text-white">欢迎创建你的财富数字分身</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-white/50">
                智能自动化需要你的财富档案作为监测基线。补全资产与收支后，AI 将开始主动守护你的财富。
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <Link
                  href="/data"
                  className="rounded-xl bg-brand-electric px-4 py-2 text-sm font-semibold text-[#04140f] hover:opacity-90"
                >
                  录入财富数据
                </Link>
                <button
                  type="button"
                  onClick={onBootstrap}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white hover:bg-white/[0.08]"
                >
                  仍要先初始化引擎
                </button>
              </div>
            </div>
          )}

          {/* 引擎状态 */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <EngineStat label="规则" total={ov.engine.rules.total} enabled={ov.engine.rules.enabled} icon={GitBranch} />
            <EngineStat label="定时任务" total={ov.engine.schedules.total} enabled={ov.engine.schedules.enabled} icon={Calendar} />
            <EngineStat label="工作流" total={ov.engine.workflows.total} enabled={ov.engine.workflows.enabled} icon={Workflow} />
            <EngineStat label="长期计划" total={ov.engine.plans.total} enabled={ov.engine.plans.enabled} icon={Bot} />
            <EngineStat
              label="今日预算"
              total={ov.cost.dailyBudget}
              enabled={ov.cost.budgetLeft}
              icon={Cpu}
              suffix={`剩余 ${ov.cost.budgetLeft}`}
            />
          </div>

          {/* AI 正在关注 + 当前任务 */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="AI 正在关注" icon={Eye} desc="已启用的规则与长期计划">
              {ov.watching.length === 0 ? (
                <Empty text="暂无启用项，点击「初始化引擎」载入默认套餐" />
              ) : (
                <ul className="space-y-2">
                  {ov.watching.map((w, i) => (
                    <li key={i} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                      <div className="flex items-center gap-2">
                        <Badge className={w.kind === "plan" ? "bg-brand-electric/15 text-brand-electric border-brand-electric/30" : "bg-white/10 text-white/70 border-white/15"}>
                          {w.kind === "plan" ? "计划" : "规则"}
                        </Badge>
                        <span className="text-sm font-medium text-white">{w.title}</span>
                      </div>
                      <p className="mt-1 text-xs text-white/50">{w.detail}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="即将执行的任务" icon={Clock} desc="已排程的定时任务">
              {ov.currentTasks.length === 0 ? (
                <Empty text="暂无排程任务" />
              ) : (
                <ul className="space-y-2">
                  {ov.currentTasks.map((t) => (
                    <li key={t.id} className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] p-3">
                      <div>
                        <p className="text-sm font-medium text-white">{t.name}</p>
                        <p className="text-xs text-white/40">{t.taskTypeLabel} · {t.frequency}</p>
                      </div>
                      <span className="text-xs text-white/50">
                        {t.dueInMinutes != null ? `${t.dueInMinutes} 分钟后` : "待定"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          {/* 下一步建议 + 偏好偏置 */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Section title="下一步建议" icon={Target} desc="来自行动中心的高优先项" className="lg:col-span-2">
              {ov.nextSteps.length === 0 ? (
                <Empty text="暂无待办建议" />
              ) : (
                <ul className="space-y-2">
                  {ov.nextSteps.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">
                      <Badge className={SEVERITY_STYLE[(s.priority as Severity) ?? "medium"]}>
                        {SEVERITY_LABEL[(s.priority as Severity) ?? "medium"]}
                      </Badge>
                      <span className="text-sm text-white">{s.title}</span>
                      <ChevronRight className="ml-auto h-4 w-4 text-white/30" />
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <Section title="提醒偏置" icon={Sparkles} desc="基于你的反馈自适应">
              <p className="text-sm text-white/70">{ov.preferenceBias.note}</p>
              <p className="mt-2 text-xs text-white/40">
                当前最低推送级别：
                <Badge className={cn("ml-1", SEVERITY_STYLE[(ov.preferenceBias.minPriority as Severity) ?? "medium"])}>
                  {SEVERITY_LABEL[(ov.preferenceBias.minPriority as Severity) ?? "medium"]}
                </Badge>
              </p>
            </Section>
          </div>

          {/* 近期运行 + 近期事件 */}
          <div className="grid gap-4 lg:grid-cols-2">
            <RecentRuns />
            <RecentEvents />
          </div>

          {/* 行动中心 */}
          <ActionsSection onToast={toast} />

          {/* 规则 */}
          <RulesSection onToast={toast} />

          {/* 定时任务 */}
          <SchedulesSection onToast={toast} />

          {/* 工作流 */}
          <WorkflowsSection onToast={toast} />

          {/* 长期计划 */}
          <PlansSection onToast={toast} />

          {/* 偏好画像 + 市场 */}
          <div className="grid gap-4 lg:grid-cols-2">
            <PreferencesSection />
            <MarketSection />
          </div>

          {/* 免责声明 */}
          <p className="pt-2 text-center text-xs text-white/30">{ov.disclaimer}</p>
        </>
      )}
    </div>
  );
}

function EngineStat({
  label,
  total,
  enabled,
  icon: Icon,
  suffix,
}: {
  label: string;
  total: number;
  enabled: number;
  icon: ComponentType<{ className?: string }>;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
      <div className="flex items-center gap-2 text-white/50">
        <Icon className="h-4 w-4" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-1 text-xl font-bold text-white">
        {enabled}
        <span className="text-sm font-normal text-white/40">/{total}</span>
      </p>
      <p className="text-[11px] text-white/40">{suffix ?? "已启用"}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-white/40">{text}</p>;
}

/* ----------------------------- 近期运行 ----------------------------- */
function RecentRuns() {
  const { data, isLoading } = useAutonomousRuns();
  return (
    <Section title="近期运行记录" icon={Activity}>
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (data ?? []).length === 0 ? (
        <Empty text="暂无运行记录" />
      ) : (
        <ul className="space-y-2">
          {data!.slice(0, 8).map((r) => (
            <li key={r.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">
              <Badge className={r.status === "success" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" : r.status === "failed" ? "bg-red-500/15 text-red-300 border-red-500/30" : "bg-white/10 text-white/60 border-white/15"}>
                {r.status}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-white">{r.name}</p>
                {r.message && <p className="truncate text-xs text-white/40">{r.message}</p>}
              </div>
              {r.llmCalled && <Badge className="bg-brand-electric/15 text-brand-electric border-brand-electric/30">LLM</Badge>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ----------------------------- 近期事件 ----------------------------- */
function RecentEvents() {
  const { data, isLoading } = useAutonomousEvents();
  return (
    <Section title="近期财富事件" icon={AlertTriangle}>
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (data ?? []).length === 0 ? (
        <Empty text="暂无事件（扫描后将在此显示资产/收支变化）" />
      ) : (
        <ul className="space-y-2">
          {data!.slice(0, 8).map((e) => (
            <li key={e.id} className="flex items-start gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">
              <Badge className={SEVERITY_STYLE[e.severity]}>{SEVERITY_LABEL[e.severity]}</Badge>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-white">{e.eventLabel}</p>
                <p className="truncate text-xs text-white/40">{e.summary}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ----------------------------- 行动中心 ----------------------------- */
function ActionsSection({ onToast }: { onToast: (m: string) => void }) {
  const [tab, setTab] = useState<ActionStatus | "all">("all");
  const { data, isLoading } = useActions(tab === "all" ? undefined : tab);
  const stats = useActionStats();
  const create = useCreateAction();
  const complete = useCompleteAction();
  const dismiss = useDismissAction();
  const defer = useDeferAction();
  const reopen = useReopenAction();
  const del = useDeleteAction();
  const [title, setTitle] = useState("");

  const tabs: { key: ActionStatus | "all"; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "pending", label: "待处理" },
    { key: "done", label: "已完成" },
    { key: "dismissed", label: "已忽略" },
    { key: "deferred", label: "已延期" },
  ];

  const s = stats.data;
  return (
    <Section
      title="行动中心"
      icon={ListChecks}
      desc="AI 的每条建议都会落成行动项，你的反馈会反哺偏好学习"
      action={
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            create.mutate(
              { title: title.trim(), priority: "medium" },
              {
                onSuccess: () => {
                  setTitle("");
                  onToast("已创建行动项");
                },
                onError: (e) => onToast(`创建失败：${(e as Error).message}`),
              },
            );
          }}
        >
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="手动新建行动项…"
            className="w-40 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-brand-electric/50 focus:outline-none"
          />
          <button
            type="submit"
            disabled={create.isPending}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-electric text-[#04140f] hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
          </button>
        </form>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-white/[0.04] p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition",
                tab === t.key ? "bg-brand-electric/20 text-brand-electric" : "text-white/50 hover:text-white",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {s && (
          <div className="flex items-center gap-3 text-xs text-white/40">
            <span>共 {s.total}</span>
            <span>待处理 {s.pending}</span>
            <span>接受率 {Math.round((s.acceptanceRate || 0) * 100)}%</span>
          </div>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (data ?? []).length === 0 ? (
        <Empty text="暂无行动项" />
      ) : (
        <ul className="space-y-2">
          {data!.map((a: AutomationAction) => (
            <li key={a.id} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
              <div className="flex items-start gap-3">
                <Badge className={SEVERITY_STYLE[a.priority]}>{SEVERITY_LABEL[a.priority]}</Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{a.title}</p>
                  {a.detail && <p className="mt-0.5 text-xs text-white/40">{a.detail}</p>}
                </div>
                <Badge className={STATUS_STYLE[a.status]}>{a.statusLabel}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {a.status === "pending" && (
                  <>
                    <MiniAction label="完成" icon={Check} onClick={() => complete.mutate(a.id, { onSuccess: () => onToast("已标记完成") })} />
                    <MiniAction label="忽略" icon={X} onClick={() => dismiss.mutate({ id: a.id }, { onSuccess: () => onToast("已忽略") })} />
                    <MiniAction label="延期7天" icon={Clock} onClick={() => defer.mutate({ id: a.id, days: 7 }, { onSuccess: () => onToast("已延期") })} />
                  </>
                )}
                {a.status !== "pending" && a.status !== "done" && (
                  <MiniAction label="重新打开" icon={RefreshCw} onClick={() => reopen.mutate(a.id, { onSuccess: () => onToast("已重新打开") })} />
                )}
                <MiniAction label="删除" icon={Trash2} danger onClick={() => del.mutate(a.id, { onSuccess: () => onToast("已删除") })} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function MiniAction({
  label,
  icon: Icon,
  onClick,
  danger,
}: {
  label: string;
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition",
        danger
          ? "border-red-500/20 text-red-300 hover:bg-red-500/10"
          : "border-white/10 text-white/70 hover:bg-white/[0.06]",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

/* ----------------------------- 规则 ----------------------------- */
function RulesSection({ onToast }: { onToast: (m: string) => void }) {
  const { data, isLoading } = useRules();
  const create = useCreateRule();
  const update = useUpdateRule();
  const del = useDeleteRule();
  const run = useRunRule();
  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState("event");
  const [tier, setTier] = useState("local");

  return (
    <Section
      title="自动化规则"
      icon={GitBranch}
      desc="事件触发型规则（当资产/收支/风险变化时自动通知或调度智能体）"
      action={
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            create.mutate(
              { name: name.trim(), triggerType, tier, conditions: [], actions: [] },
              { onSuccess: () => { setName(""); onToast("已创建规则"); }, onError: (e) => onToast(`创建失败：${(e as Error).message}`) },
            );
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="规则名称"
            className="w-36 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-brand-electric/50 focus:outline-none"
          />
          <select
            value={triggerType}
            onChange={(e) => setTriggerType(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-sm text-white focus:outline-none"
          >
            <option value="event">事件触发</option>
            <option value="schedule">定时触发</option>
          </select>
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-sm text-white focus:outline-none"
          >
            <option value="local">local</option>
            <option value="light">light</option>
            <option value="ai">ai</option>
          </select>
          <button type="submit" disabled={create.isPending} className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-electric text-[#04140f] hover:opacity-90 disabled:opacity-50">
            <Plus className="h-4 w-4" />
          </button>
        </form>
      }
    >
      {isLoading ? <Skeleton className="h-24 w-full" /> : (data ?? []).length === 0 ? <Empty text="暂无规则，点击「初始化引擎」载入默认三规则" /> : (
        <ul className="space-y-2">
          {data!.map((r: AutomationRule) => (
            <li key={r.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">
              <Toggle on={r.enabled} onChange={() => update.mutate({ id: r.id, body: { enabled: !r.enabled } })} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">{r.name}</p>
                <p className="text-xs text-white/40">
                  {r.triggerType} · tier={r.tier} · 触发 {r.triggerCount} 次
                </p>
              </div>
              <button type="button" onClick={() => run.mutate(r.id, { onSuccess: () => onToast("已触发规则") })} className="flex h-8 items-center gap-1 rounded-lg border border-white/10 px-2 text-xs text-white/70 hover:bg-white/[0.06]">
                <Play className="h-3.5 w-3.5" /> 运行
              </button>
              <button type="button" onClick={() => del.mutate(r.id, { onSuccess: () => onToast("已删除") })} className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/20 text-red-300 hover:bg-red-500/10">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ----------------------------- 定时任务 ----------------------------- */
function SchedulesSection({ onToast }: { onToast: (m: string) => void }) {
  const { data, isLoading } = useSchedules();
  const create = useCreateSchedule();
  const update = useUpdateSchedule();
  const del = useDeleteSchedule();
  const run = useRunSchedule();
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState("daily");
  const [taskType, setTaskType] = useState("daily_briefing");
  const taskTypes = [
    { v: "daily_briefing", l: "每日财富日报" },
    { v: "weekly_summary", l: "每周现金流总结" },
    { v: "cashflow_review", l: "现金流复检" },
    { v: "investment_review", l: "投资组合复检" },
    { v: "preference_learning", l: "偏好学习" },
    { v: "event_scan", l: "财富变化扫描" },
  ];

  return (
    <Section
      title="定时任务"
      icon={Calendar}
      desc="按频率自动执行日报、周报、复检等任务"
      action={
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            create.mutate(
              { name: name.trim(), frequency, taskType, hour: 8 },
              { onSuccess: () => { setName(""); onToast("已创建定时任务"); }, onError: (e) => onToast(`创建失败：${(e as Error).message}`) },
            );
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="任务名称" className="w-32 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-brand-electric/50 focus:outline-none" />
          <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-sm text-white focus:outline-none">
            <option value="daily">daily</option>
            <option value="weekly">weekly</option>
            <option value="once">once</option>
          </select>
          <select value={taskType} onChange={(e) => setTaskType(e.target.value)} className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-sm text-white focus:outline-none">
            {taskTypes.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
          <button type="submit" disabled={create.isPending} className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-electric text-[#04140f] hover:opacity-90 disabled:opacity-50"><Plus className="h-4 w-4" /></button>
        </form>
      }
    >
      {isLoading ? <Skeleton className="h-24 w-full" /> : (data ?? []).length === 0 ? <Empty text="暂无定时任务" /> : (
        <ul className="space-y-2">
          {data!.map((s: AutomationSchedule) => (
            <li key={s.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">
              <Toggle on={s.enabled} onChange={() => update.mutate({ id: s.id, body: { enabled: !s.enabled } })} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">{s.name}</p>
                <p className="text-xs text-white/40">{s.taskTypeLabel} · {s.frequency} · 下次 {s.nextRunAt ? new Date(s.nextRunAt).toLocaleString() : "—"}</p>
              </div>
              <button type="button" onClick={() => run.mutate({ id: s.id, force: false }, { onSuccess: () => onToast("已执行定时任务") })} className="flex h-8 items-center gap-1 rounded-lg border border-white/10 px-2 text-xs text-white/70 hover:bg-white/[0.06]">
                <Play className="h-3.5 w-3.5" /> 运行
              </button>
              <button type="button" onClick={() => del.mutate(s.id, { onSuccess: () => onToast("已删除") })} className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/20 text-red-300 hover:bg-red-500/10">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ----------------------------- 工作流 ----------------------------- */
function WorkflowsSection({ onToast }: { onToast: (m: string) => void }) {
  const { data, isLoading } = useWorkflows();
  const templates = useWorkflowTemplates();
  const create = useCreateWorkflow();
  const del = useDeleteWorkflow();
  const run = useRunAutoWorkflow();
  const [name, setName] = useState("");
  const [templateKey, setTemplateKey] = useState("");

  return (
    <Section
      title="自动化工作流"
      icon={Workflow}
      desc="多步骤编排，可由事件或手动触发"
      action={
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            create.mutate(
              { name: name.trim(), templateKey: templateKey || undefined, steps: [] },
              { onSuccess: () => { setName(""); setTemplateKey(""); onToast("已创建工作流"); }, onError: (e) => onToast(`创建失败：${(e as Error).message}`) },
            );
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="工作流名称" className="w-36 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-brand-electric/50 focus:outline-none" />
          <select value={templateKey} onChange={(e) => setTemplateKey(e.target.value)} className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-sm text-white focus:outline-none">
            <option value="">空白工作流</option>
            {(templates.data ?? []).map((t: WorkflowTemplate) => <option key={t.key} value={t.key}>{t.name}</option>)}
          </select>
          <button type="submit" disabled={create.isPending} className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-electric text-[#04140f] hover:opacity-90 disabled:opacity-50"><Plus className="h-4 w-4" /></button>
        </form>
      }
    >
      {isLoading ? <Skeleton className="h-24 w-full" /> : (data ?? []).length === 0 ? <Empty text="暂无工作流" /> : (
        <ul className="space-y-2">
          {data!.map((w: AutomationWorkflow) => (
            <li key={w.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">{w.name}</p>
                <p className="text-xs text-white/40">{w.steps.length} 步 · 运行 {w.runCount} 次</p>
              </div>
              <button type="button" onClick={() => run.mutate(w.id, { onSuccess: () => onToast("已执行工作流") })} className="flex h-8 items-center gap-1 rounded-lg border border-white/10 px-2 text-xs text-white/70 hover:bg-white/[0.06]">
                <Play className="h-3.5 w-3.5" /> 运行
              </button>
              <button type="button" onClick={() => del.mutate(w.id, { onSuccess: () => onToast("已删除") })} className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/20 text-red-300 hover:bg-red-500/10">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ----------------------------- 长期计划 ----------------------------- */
function PlansSection({ onToast }: { onToast: (m: string) => void }) {
  const { data, isLoading } = usePlans();
  const create = useCreatePlan();
  const del = useDeletePlan();
  const run = useRunPlan();
  const [name, setName] = useState("");
  const [agentKind, setAgetKind] = useState("retirement");
  const [cadence, setCadence] = useState("weekly");

  return (
    <Section
      title="长期运行计划"
      icon={Bot}
      desc="让智能体持续跟踪目标（退休/投资/现金流/风险）"
      action={
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            create.mutate(
              { name: name.trim(), agentKind, cadence },
              { onSuccess: () => { setName(""); onToast("已创建长期计划"); }, onError: (e) => onToast(`创建失败：${(e as Error).message}`) },
            );
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="计划名称" className="w-32 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-brand-electric/50 focus:outline-none" />
          <select value={agentKind} onChange={(e) => setAgetKind(e.target.value)} className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-sm text-white focus:outline-none">
            <option value="retirement">退休规划</option>
            <option value="investment">投资组合</option>
            <option value="cashflow">现金流</option>
            <option value="risk">风险控制</option>
          </select>
          <select value={cadence} onChange={(e) => setCadence(e.target.value)} className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-sm text-white focus:outline-none">
            <option value="weekly">weekly</option>
            <option value="quarterly">quarterly</option>
          </select>
          <button type="submit" disabled={create.isPending} className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-electric text-[#04140f] hover:opacity-90 disabled:opacity-50"><Plus className="h-4 w-4" /></button>
        </form>
      }
    >
      {isLoading ? <Skeleton className="h-24 w-full" /> : (data ?? []).length === 0 ? <Empty text="暂无长期计划" /> : (
        <ul className="space-y-2">
          {data!.map((p: AutomationPlan) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">{p.name}</p>
                <p className="text-xs text-white/40">{p.agentLabel} · {p.cadence} · 下次 {p.nextRunAt ? new Date(p.nextRunAt).toLocaleString() : "—"}</p>
                {p.lastSummary && <p className="mt-1 line-clamp-2 text-xs text-white/40">{p.lastSummary}</p>}
              </div>
              <button type="button" onClick={() => run.mutate({ id: p.id, force: false }, { onSuccess: () => onToast("已执行巡检") })} className="flex h-8 items-center gap-1 rounded-lg border border-white/10 px-2 text-xs text-white/70 hover:bg-white/[0.06]">
                <Play className="h-3.5 w-3.5" /> 巡检
              </button>
              <button type="button" onClick={() => del.mutate(p.id, { onSuccess: () => onToast("已删除") })} className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/20 text-red-300 hover:bg-red-500/10">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ----------------------------- 偏好画像 ----------------------------- */
function PreferencesSection() {
  const { data, isLoading } = usePreferences();
  const bias = usePreferenceBias();
  return (
    <Section title="偏好画像" icon={Sparkles} desc="基于你的行动反馈持续学习">
      {isLoading ? <Skeleton className="h-24 w-full" /> : !data ? <Empty text="暂无偏好数据" /> : (
        <div className="space-y-3">
          <p className="text-xs text-white/40">{data.learned ? "已学习，样本持续积累中" : "样本不足，完成一些行动项后将自动学习"}</p>
          {(data.dimensions ?? []).map((d) => (
            <div key={d.dimension} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">{d.dimension}</span>
                <span className="text-xs text-white/40">置信度 {Math.round((d.confidence || 0) * 100)}% · 样本 {d.sampleCount}</span>
              </div>
              <pre className="mt-1 max-h-28 overflow-auto text-[11px] text-white/50">{JSON.stringify(d.value, null, 2)}</pre>
            </div>
          ))}
          {bias.data && (
            <p className="text-xs text-white/50">
              <Info className="mr-1 inline h-3 w-3" />
              {bias.data.note}
            </p>
          )}
        </div>
      )}
    </Section>
  );
}

/* ----------------------------- 市场数据 ----------------------------- */
function MarketSection() {
  const [symbol, setSymbol] = useState("");
  const [marketType, setMarketType] = useState("stock");
  const price = useMarketPrice(symbol, marketType);
  const portfolio = usePortfolioChange();

  return (
    <Section title="市场数据" icon={TrendingUp} desc="离线优雅降级，无行情源时返回 degraded">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="代码，如 600519"
          className="w-40 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-brand-electric/50 focus:outline-none"
        />
        <select value={marketType} onChange={(e) => setMarketType(e.target.value)} className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-sm text-white focus:outline-none">
          <option value="stock">stock</option>
          <option value="fund">fund</option>
          <option value="crypto">crypto</option>
        </select>
      </div>

      {symbol.trim() && (
        <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">
          {price.isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : price.data ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white/60">{price.data.symbol}</p>
                <p className="text-lg font-bold text-white">
                  {price.data.price != null ? `¥${price.data.price.toLocaleString()}` : "—"}
                </p>
              </div>
              {price.data.changePct != null && (
                <span className={cn("flex items-center gap-1 text-sm font-semibold", price.data.changePct >= 0 ? "text-red-400" : "text-emerald-400")}>
                  {price.data.changePct >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {price.data.changePct >= 0 ? "涨" : "跌"} {Math.abs(price.data.changePct)}%
                </span>
              )}
            </div>
          ) : (
            <p className="text-sm text-white/40">暂无数据</p>
          )}
          {price.data?.degraded && (
            <p className="mt-2 text-xs text-amber-300/80">
              <AlertTriangle className="mr-1 inline h-3 w-3" />
              行情源离线，已降级为缓存/模拟数据（{price.data.reason}）
            </p>
          )}
        </div>
      )}

      <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">
        <p className="text-xs text-white/50">组合总变动</p>
        {portfolio.isLoading ? (
          <Skeleton className="mt-1 h-8 w-full" />
        ) : portfolio.data ? (
          <div>
            <p className="text-lg font-bold text-white">
              {portfolio.data.totalChangePct != null ? `${portfolio.data.totalChangePct}%` : "—"}
            </p>
            {portfolio.data.degraded && (
              <p className="mt-1 text-xs text-amber-300/80">
                <AlertTriangle className="mr-1 inline h-3 w-3" />
                {portfolio.data.reason}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-white/40">暂无组合数据</p>
        )}
      </div>
    </Section>
  );
}
