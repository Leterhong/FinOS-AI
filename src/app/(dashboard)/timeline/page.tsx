"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PageTransition from "@/components/dashboard/PageTransition";
import GlassCard from "@/components/ui/GlassCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";
import {
  useTimeline,
  useAddTimelineEvent,
  useDeleteTimelineEvent,
} from "@/hooks/use-backend";
import type { TimelineData, TimelineNode } from "@/types/personal_os";
import {
  History,
  Sparkles,
  Plus,
  X,
  Trash2,
  CalendarDays,
  AlertTriangle,
  ListChecks,
  Loader2,
} from "lucide-react";

/* ───────────────────────── 常量 ───────────────────────── */

type SegmentKey = "past" | "now" | "future";

interface SegmentConfig {
  key: SegmentKey;
  label: string;
  hint: string;
  /** 时间轴竖线 */
  line: string;
  /** 节点圆点 */
  dot: string;
  /** 卡片容器 */
  card: string;
  /** 段落标题色 */
  heading: string;
}

const SEGMENTS: SegmentConfig[] = [
  {
    key: "past",
    label: "已经发生",
    hint: "已被记录的财富轨迹",
    line: "bg-white/10",
    dot: "bg-white/25 ring-4 ring-white/[0.04]",
    card: "border-white/8 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.035]",
    heading: "text-white/45",
  },
  {
    key: "now",
    label: "此刻",
    hint: "当前所处的财富位置",
    line: "bg-semantic-success/30",
    dot: "bg-semantic-success ring-4 ring-semantic-success/15",
    card: "border-semantic-success/25 bg-semantic-success/[0.05] hover:border-semantic-success/40 hover:bg-semantic-success/[0.08]",
    heading: "text-semantic-success",
  },
  {
    key: "future",
    label: "预见未来",
    hint: "尚未发生的预期节点",
    line: "bg-white/8",
    dot: "border border-dashed border-white/30 bg-transparent",
    card: "border-dashed border-white/12 bg-transparent hover:border-white/25 hover:bg-white/[0.02]",
    heading: "text-white/40",
  },
];

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: "career", label: "职业发展" },
  { value: "family", label: "家庭" },
  { value: "asset", label: "资产" },
  { value: "education", label: "教育" },
  { value: "health", label: "健康" },
  { value: "other", label: "其他" },
];

const SOURCE_LABELS: Record<string, string> = {
  system: "系统",
  user: "我添加",
  ai: "AI 推断",
};

/* ───────────────────────── 工具 ───────────────────────── */

function formatDate(raw: string): string {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

function sourceTone(source: string): "success" | "info" | "neutral" {
  if (source === "user") return "success";
  if (source === "ai") return "info";
  return "neutral";
}

/* ───────────────────────── 页面 ───────────────────────── */

export default function TimelinePage() {
  const timelineQ = useTimeline();
  const [formOpen, setFormOpen] = useState<boolean>(false);

  const data = timelineQ.data as TimelineData | undefined;
  const loading: boolean = timelineQ.isLoading;
  const hasData: boolean = data?.hasData === true;
  const events: TimelineNode[] = data?.events ?? [];

  return (
    <PageTransition>
      <div className="space-y-7">
        {/* 页头 */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-wrap items-end justify-between gap-4"
        >
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-brand shadow-glow-success">
                <History className="h-4 w-4 text-white" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-white">财富时间线</h1>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-white/55">
              把过去的积累、此刻的位置与预见中的未来串成一条完整叙事，让每一个重要节点都能被看见、被解释。
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/45 sm:inline-flex">
              <CalendarDays className="h-3 w-3" /> 共 {events.length} 条自定义事件
            </span>
            <button
              type="button"
              onClick={() => setFormOpen((v: boolean) => !v)}
              className="inline-flex items-center gap-2 rounded-full border border-semantic-success/30 bg-semantic-success/10 px-4 py-2 text-xs font-medium text-semantic-success transition hover:bg-semantic-success/20"
            >
              {formOpen ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {formOpen ? "收起表单" : "添加人生事件"}
            </button>
          </div>
        </motion.div>

        {/* 添加表单 */}
        <AnimatePresence initial={false}>
          {formOpen && (
            <motion.div
              key="add-form"
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <AddEventForm onDone={() => setFormOpen(false)} />
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <LoadingState />
        ) : timelineQ.error ? (
          <ErrorState />
        ) : !hasData ? (
          <WelcomeState message={data?.message} />
        ) : (
          <>
            {SEGMENTS.map((seg: SegmentConfig, idx: number) => (
              <TimelineSegment key={seg.key} config={seg} nodes={data?.[seg.key] ?? []} index={idx} />
            ))}

            <MyEventsSection events={events} onAdd={() => setFormOpen(true)} />
          </>
        )}

        <p className="pt-2 text-center text-[11px] text-white/30">
          时间线由你的财富档案自动生成，人生事件可随时手动补充与删除。
        </p>
      </div>
    </PageTransition>
  );
}

/* ───────────────────────── 子组件 ───────────────────────── */

function TimelineSegment({
  config,
  nodes,
  index,
}: {
  config: SegmentConfig;
  nodes: TimelineNode[];
  index: number;
}) {
  return (
    <GlassCard className="p-5" delay={index * 0.06}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            {config.key === "now" && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-semantic-success opacity-50" />
            )}
            <span
              className={cn(
                "relative inline-flex h-2 w-2 rounded-full",
                config.key === "now"
                  ? "bg-semantic-success"
                  : config.key === "past"
                    ? "bg-white/30"
                    : "border border-dashed border-white/35"
              )}
            />
          </span>
          <h2 className={cn("text-sm font-semibold", config.key === "now" ? "text-white" : "text-white/85")}>
            {config.label}
          </h2>
        </div>
        <span className="text-[11px] text-white/35">
          {config.hint} · {nodes.length} 个节点
        </span>
      </div>

      {nodes.length === 0 ? (
        <EmptyHint text={`${config.label}暂无节点`} />
      ) : (
        <div className="relative pl-6">
          {/* 竖线 */}
          <span className={cn("absolute left-[3px] top-1.5 bottom-1.5 w-px", config.line)} />
          <div className="space-y-3">
            {nodes.map((node: TimelineNode, i: number) => (
              <TimelineItem key={node.id} node={node} config={config} delay={i * 0.05} />
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  );
}

function TimelineItem({
  node,
  config,
  delay,
}: {
  node: TimelineNode;
  config: SegmentConfig;
  delay: number;
}) {
  const del = useDeleteTimelineEvent();
  const deleting: boolean = del.isPending;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      className="relative"
    >
      {/* 节点圆点 */}
      <span
        className={cn(
          "absolute -left-[26px] top-4 h-[7px] w-[7px] rounded-full",
          config.dot,
          config.key === "now" && "shadow-glow-success"
        )}
      />
      <div className={cn("rounded-xl border px-4 py-3 transition", config.card)}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className={cn(
                "font-medium text-white",
                node.importance >= 4 ? "text-[15px]" : node.importance >= 3 ? "text-sm" : "text-[13px]"
              )}
            >
              {node.title}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-white/40">
              <CalendarDays className="h-3 w-3" />
              {formatDate(node.eventDate)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <StatusBadge tone={sourceTone(node.source)} dot={false}>
              {SOURCE_LABELS[node.source] ?? node.source}
            </StatusBadge>
            {node.deletable && (
              <button
                type="button"
                onClick={() => del.mutate(node.id)}
                disabled={deleting}
                aria-label="删除该事件"
                className="rounded-md border border-white/10 bg-white/[0.03] p-1.5 text-white/35 transition hover:border-semantic-risk/30 hover:text-semantic-risk disabled:cursor-not-allowed disabled:opacity-40"
              >
                {deleting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
              </button>
            )}
          </div>
        </div>

        {node.description && (
          <p className="mt-2 text-[12px] leading-relaxed text-white/55">{node.description}</p>
        )}

        <ImportanceDots value={node.importance} active={config.key === "now"} />
      </div>
    </motion.div>
  );
}

function ImportanceDots({ value, active }: { value: number; active?: boolean }) {
  const level: number = Math.max(1, Math.min(5, Math.round(value || 1)));
  return (
    <div className="mt-2.5 flex items-center gap-1.5">
      <span className="text-[10px] tracking-wide text-white/25">权重</span>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((i: number) => (
          <span
            key={i}
            className={cn(
              "h-1 w-1 rounded-full",
              i <= level ? (active ? "bg-semantic-success" : "bg-white/45") : "bg-white/12"
            )}
          />
        ))}
      </div>
    </div>
  );
}

function AddEventForm({ onDone }: { onDone: () => void }) {
  const add = useAddTimelineEvent();
  const [title, setTitle] = useState<string>("");
  const [category, setCategory] = useState<string>("career");
  const [eventDate, setEventDate] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [hint, setHint] = useState<string>("");

  const submit = (): void => {
    if (title.trim() === "") {
      setHint("请填写事件标题");
      return;
    }
    if (eventDate.trim() === "") {
      setHint("请选择事件发生日期");
      return;
    }
    setHint("");
    add.mutate(
      {
        title: title.trim(),
        category,
        eventDate,
        description: description.trim() === "" ? undefined : description.trim(),
      },
      {
        onSuccess: () => {
          setTitle("");
          setCategory("career");
          setEventDate("");
          setDescription("");
          onDone();
        },
        onError: () => setHint("添加失败，请稍后重试"),
      }
    );
  };

  return (
    <GlassCard className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-semantic-success">
          <Plus className="h-4 w-4" />
        </span>
        <h2 className="text-sm font-semibold text-white">添加人生事件</h2>
        <span className="text-[11px] text-white/35">手动补充的节点会进入你的时间线叙事</span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="事件标题（必填）">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="如 换城市工作 / 购入首套房"
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:border-semantic-success/40"
          />
        </Field>
        <Field label="事件类别">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-semantic-success/40"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-surface text-white">
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="发生日期（必填）">
          <input
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-semantic-success/40 [color-scheme:dark]"
          />
        </Field>
        <Field label="补充说明（选填）">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={1}
            placeholder="这件事对你的财富意味着什么"
            className="w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:border-semantic-success/40"
          />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={add.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-brand px-4 py-2 text-xs font-medium text-white shadow-glow-success transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {add.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          {add.isPending ? "保存中…" : "保存到时间线"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-white/50 transition hover:text-white/80"
        >
          取消
        </button>
        {hint && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-semantic-warn">
            <AlertTriangle className="h-3 w-3" /> {hint}
          </span>
        )}
      </div>
    </GlassCard>
  );
}

function MyEventsSection({ events, onAdd }: { events: TimelineNode[]; onAdd: () => void }) {
  return (
    <GlassCard className="p-5" delay={0.2}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-semantic-success">
            <ListChecks className="h-4 w-4" />
          </span>
          <h2 className="text-sm font-semibold text-white">我的人生事件</h2>
        </div>
        <span className="text-[11px] text-white/35">手动录入的节点管理入口</span>
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl bg-white/[0.02] py-8 text-center ring-1 ring-white/10">
          <p className="text-sm text-white/40">还没有手动录入的人生事件</p>
          <button
            type="button"
            onClick={onAdd}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-semantic-success/30 bg-semantic-success/10 px-3.5 py-1.5 text-[11px] font-medium text-semantic-success transition hover:bg-semantic-success/20"
          >
            <Plus className="h-3 w-3" /> 添加第一个事件
          </button>
        </div>
      ) : (
        <div className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/8">
          {events.map((node: TimelineNode, i: number) => (
            <CompactEventRow key={node.id} node={node} delay={i * 0.04} />
          ))}
        </div>
      )}
    </GlassCard>
  );
}

function CompactEventRow({ node, delay }: { node: TimelineNode; delay: number }) {
  const del = useDeleteTimelineEvent();
  const deleting: boolean = del.isPending;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center justify-between gap-4 bg-white/[0.015] px-4 py-3 transition hover:bg-white/[0.035]"
    >
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-white">{node.title}</p>
        <p className="mt-0.5 truncate text-[11px] text-white/40">
          {formatDate(node.eventDate)}
          {node.description ? ` · ${node.description}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StatusBadge tone={sourceTone(node.source)} dot={false}>
          {SOURCE_LABELS[node.source] ?? node.source}
        </StatusBadge>
        {node.deletable && (
          <button
            type="button"
            onClick={() => del.mutate(node.id)}
            disabled={deleting}
            aria-label="删除该事件"
            className="rounded-md border border-white/10 bg-white/[0.03] p-1.5 text-white/35 transition hover:border-semantic-risk/30 hover:text-semantic-risk disabled:cursor-not-allowed disabled:opacity-40"
          >
            {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
          </button>
        )}
      </div>
    </motion.div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-white/45">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-xl bg-white/[0.02] py-8 text-center text-sm text-white/40 ring-1 ring-white/10">
      {text}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-6">
      {[0, 1, 2].map((i: number) => (
        <GlassCard key={i} className="h-48 animate-pulse p-5">
          <div className="h-full rounded-xl bg-white/[0.03]" />
        </GlassCard>
      ))}
    </div>
  );
}

function ErrorState() {
  return (
    <GlassCard className="p-10 text-center">
      <AlertTriangle className="mx-auto h-8 w-8 text-semantic-warn/70" />
      <p className="mt-4 text-base font-medium text-white">时间线加载失败</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
        未能获取你的财富时间线数据，可能是网络波动或登录状态失效。请稍后刷新页面重试。
      </p>
    </GlassCard>
  );
}

function WelcomeState({ message }: { message?: string }) {
  return (
    <GlassCard className="p-12 text-center">
      <History className="mx-auto h-9 w-9 text-white/20" />
      <p className="mt-4 text-base font-medium text-white">欢迎创建你的财富数字分身</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
        {message ??
          "完善财富档案后，AI 会自动梳理你的过去、定位此刻、并推演未来的关键节点，生成属于你的财富时间线。"}
      </p>
      <a
        href="/onboarding"
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-brand px-5 py-2.5 text-sm font-medium text-white shadow-glow-success transition hover:opacity-90"
      >
        <Sparkles className="h-4 w-4" /> 创建财富数字分身
      </a>
    </GlassCard>
  );
}
