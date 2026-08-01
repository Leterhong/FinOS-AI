"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import PageTransition from "@/components/dashboard/PageTransition";
import GlassCard from "@/components/ui/GlassCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";
import {
  useNotifications,
  useMarkNotificationRead,
  useArchiveNotification,
  useDeleteNotification,
  useCreateNotification,
} from "@/hooks/use-backend";
import type { NotificationsResponse } from "@/hooks/use-backend";
import type { AppNotification } from "@/types/personal_os";
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Archive,
  ArchiveRestore,
  Trash2,
  Plus,
  X,
  AlertTriangle,
  Inbox,
} from "lucide-react";

/* ───────────────────────── 常量 ───────────────────────── */

type StatusFilter = "unread" | "all" | "archived";

const CATEGORY_TABS: { key: string | undefined; label: string }[] = [
  { key: undefined, label: "全部" },
  { key: "wealth", label: "财富" },
  { key: "risk", label: "风险" },
  { key: "goal", label: "目标" },
  { key: "ai", label: "AI" },
  { key: "system", label: "系统" },
];

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "unread", label: "未读" },
  { key: "all", label: "全部" },
  { key: "archived", label: "已归档" },
];

const CATEGORY_LABELS: Record<string, string> = {
  wealth: "财富",
  risk: "风险",
  goal: "目标",
  ai: "AI",
  system: "系统",
};

const SEVERITY_OPTIONS: { value: string; label: string }[] = [
  { value: "info", label: "普通 info" },
  { value: "warn", label: "警告 warn" },
  { value: "critical", label: "严重 critical" },
];

/* ───────────────────────── 工具函数 ───────────────────────── */

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "—";
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return "—";
  const diff = Date.now() - ts;
  if (diff < 0) return "刚刚";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 个月前`;
  return `${Math.floor(months / 12)} 年前`;
}

function severityTone(severity: string): "neutral" | "warn" | "error" {
  if (severity === "warn") return "warn";
  if (severity === "critical") return "error";
  return "neutral";
}

function severityLabel(severity: string): string {
  if (severity === "warn") return "警告";
  if (severity === "critical") return "严重";
  return "提示";
}

function emptyText(status: StatusFilter, category: string | undefined): string {
  const scope = category ? `「${CATEGORY_LABELS[category] ?? category}」分类下` : "";
  if (status === "unread") return `${scope}暂无未读通知`;
  if (status === "archived") return `${scope}暂无归档通知`;
  return scope ? `${scope}还没有任何通知` : "还没有任何通知";
}

/* ───────────────────────── 页面 ───────────────────────── */

export default function NotificationsPage() {
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [composerOpen, setComposerOpen] = useState<boolean>(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState<boolean>(false);

  const params = useMemo(
    () => ({
      category,
      unread: status === "unread" ? true : undefined,
      archived: status === "archived" ? true : undefined,
    }),
    [category, status]
  );

  const listQ = useNotifications(params);
  const markRead = useMarkNotificationRead();
  const archive = useArchiveNotification();
  const remove = useDeleteNotification();

  const data = listQ.data as NotificationsResponse | undefined;
  const notifications: AppNotification[] = data?.notifications ?? [];
  const unreadCount: number = data?.unread ?? 0;
  const unreadInView: AppNotification[] = notifications.filter((n) => !n.read);

  const markAllRead = async () => {
    if (unreadInView.length === 0) return;
    setMarkingAll(true);
    try {
      for (const n of unreadInView) {
        await markRead.mutateAsync(n.id);
      }
    } catch {
      /* 错误由 query 层处理，页面保持现状 */
    } finally {
      setMarkingAll(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    try {
      await remove.mutateAsync(id);
    } catch {
      /* 保持现状 */
    } finally {
      setConfirmId(null);
    }
  };

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
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-brand shadow-glow-blue">
                <Bell className="h-4 w-4 text-white" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-white">通知中心</h1>
              {unreadCount > 0 ? (
                <StatusBadge tone="success">{unreadCount} 条未读</StatusBadge>
              ) : (
                <StatusBadge tone="neutral">全部已读</StatusBadge>
              )}
            </div>
            <p className="mt-2 max-w-2xl text-sm text-white/55">
              汇总财富变动、风险预警、目标进度与 AI 分析产生的所有提醒。可按分类与状态筛选，
              支持标记已读、归档与删除。
            </p>
          </div>
          <div className="flex items-center gap-3">
            {unreadInView.length > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                disabled={markingAll}
                className="inline-flex items-center gap-2 rounded-full border border-brand-electric/30 bg-brand-electric/10 px-4 py-2 text-xs font-medium text-brand-electric transition hover:bg-brand-electric/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCheck className={markingAll ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
                {markingAll ? "处理中…" : "全部标为已读"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setComposerOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-full bg-gradient-brand px-4 py-2 text-xs font-medium text-white shadow-glow-blue transition hover:opacity-90"
            >
              {composerOpen ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {composerOpen ? "收起表单" : "新建通知"}
            </button>
          </div>
        </motion.div>

        {/* 新建通知折叠表单 */}
        <AnimatePresence initial={false}>
          {composerOpen && (
            <motion.div
              key="composer"
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <Composer onDone={() => setComposerOpen(false)} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* 筛选区 */}
        <GlassCard className="p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[11px] text-white/35">分类</span>
              {CATEGORY_TABS.map((t) => (
                <button
                  key={t.label}
                  type="button"
                  onClick={() => setCategory(t.key)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs transition",
                    category === t.key
                      ? "border-brand-electric/40 bg-brand-electric/10 text-brand-electric"
                      : "border-white/10 bg-white/[0.03] text-white/50 hover:text-white/80"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[11px] text-white/35">状态</span>
              {STATUS_TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setStatus(t.key)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs transition",
                    status === t.key
                      ? "border-brand-electric/40 bg-brand-electric/10 text-brand-electric"
                      : "border-white/10 bg-white/[0.03] text-white/50 hover:text-white/80"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </GlassCard>

        {/* 列表 */}
        {listQ.isLoading ? (
          <LoadingState />
        ) : listQ.isError ? (
          <ErrorState onRetry={() => void listQ.refetch()} />
        ) : notifications.length === 0 ? (
          <EmptyState text={emptyText(status, category)} />
        ) : (
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {notifications.map((n, idx) => (
                <motion.div
                  key={n.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8, transition: { duration: 0.2 } }}
                  transition={{ duration: 0.35, delay: Math.min(idx, 8) * 0.035, ease: [0.22, 1, 0.36, 1] }}
                >
                  <NotificationRow
                    item={n}
                    confirming={confirmId === n.id}
                    readPending={markRead.isPending && markRead.variables === n.id}
                    archivePending={archive.isPending && archive.variables === n.id}
                    deletePending={remove.isPending && remove.variables === n.id}
                    onMarkRead={() => markRead.mutate(n.id)}
                    onArchive={() => archive.mutate(n.id)}
                    onDelete={() => void handleDelete(n.id)}
                    onCancelDelete={() => setConfirmId(null)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        <p className="pt-2 text-center text-[11px] text-white/30">
          通知仅用于信息提醒与辅助决策，不构成投资建议。
        </p>
      </div>
    </PageTransition>
  );
}

/* ───────────────────────── 子组件 ───────────────────────── */

function NotificationRow({
  item,
  confirming,
  readPending,
  archivePending,
  deletePending,
  onMarkRead,
  onArchive,
  onDelete,
  onCancelDelete,
}: {
  item: AppNotification;
  confirming: boolean;
  readPending: boolean;
  archivePending: boolean;
  deletePending: boolean;
  onMarkRead: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onCancelDelete: () => void;
}) {
  const unread = !item.read;
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02] p-4 pl-5 transition hover:border-white/15 hover:bg-white/[0.035]",
        !unread && "opacity-60"
      )}
    >
      {unread && (
        <span className="absolute left-0 top-0 h-full w-[3px] bg-semantic-success" aria-hidden />
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={cn(
                "text-sm text-white",
                unread ? "font-semibold" : "font-normal text-white/80"
              )}
            >
              {item.title}
            </p>
            <StatusBadge tone={severityTone(item.severity)} dot={false}>
              {severityLabel(item.severity)}
            </StatusBadge>
            <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/45">
              {CATEGORY_LABELS[item.category] ?? item.category}
            </span>
            {item.archived && (
              <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/40">
                已归档
              </span>
            )}
          </div>
          {item.body && (
            <p className="mt-1.5 text-[12px] leading-relaxed text-white/55">{item.body}</p>
          )}
          <p className="mt-2 text-[11px] text-white/30">{formatRelativeTime(item.createdAt)}</p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {unread && (
            <RowButton onClick={onMarkRead} disabled={readPending} icon={<Check className="h-3 w-3" />}>
              {readPending ? "处理中…" : "标为已读"}
            </RowButton>
          )}
          <RowButton
            onClick={onArchive}
            disabled={archivePending}
            icon={
              item.archived ? (
                <ArchiveRestore className="h-3 w-3" />
              ) : (
                <Archive className="h-3 w-3" />
              )
            }
          >
            {archivePending ? "处理中…" : item.archived ? "取消归档" : "归档"}
          </RowButton>
          {confirming ? (
            <>
              <RowButton
                onClick={onDelete}
                disabled={deletePending}
                tone="danger"
                icon={<Trash2 className="h-3 w-3" />}
              >
                {deletePending ? "删除中…" : "确认删除?"}
              </RowButton>
              <RowButton onClick={onCancelDelete} icon={<X className="h-3 w-3" />}>
                取消
              </RowButton>
            </>
          ) : (
            <RowButton onClick={onDelete} disabled={deletePending} tone="danger" icon={<Trash2 className="h-3 w-3" />}>
              删除
            </RowButton>
          )}
        </div>
      </div>
    </div>
  );
}

function RowButton({
  onClick,
  disabled = false,
  tone = "default",
  icon,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-50",
        tone === "danger"
          ? "border-semantic-risk/25 bg-semantic-risk/[0.06] text-semantic-risk hover:bg-semantic-risk/15"
          : "border-white/10 bg-white/[0.03] text-white/55 hover:border-white/20 hover:text-white/85"
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function Composer({ onDone }: { onDone: () => void }) {
  const create = useCreateNotification();
  const [title, setTitle] = useState<string>("");
  const [body, setBody] = useState<string>("");
  const [category, setCategory] = useState<string>("system");
  const [severity, setSeverity] = useState<string>("info");

  const submit = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    try {
      await create.mutateAsync({
        title: trimmed,
        body: body.trim() || undefined,
        category,
        severity,
      });
      setTitle("");
      setBody("");
      setCategory("system");
      setSeverity("info");
      onDone();
    } catch {
      /* 错误提示由下方 error 分支展示 */
    }
  };

  return (
    <GlassCard className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-brand-electric">
          <Plus className="h-4 w-4" />
        </span>
        <h2 className="text-sm font-semibold text-white">新建通知</h2>
        <span className="text-[11px] text-white/35">用于测试与手动提醒</span>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-[11px] text-white/45">标题（必填）</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="如：本月支出超出预算 12%"
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-brand-electric/40"
          />
        </div>
        <div>
          <label className="text-[11px] text-white/45">内容（可选）</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="补充说明这条提醒的背景与建议动作"
            className="mt-1 w-full resize-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none placeholder:text-white/25 focus:border-brand-electric/40"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-[11px] text-white/45">分类</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-brand-electric/40"
            >
              {CATEGORY_TABS.filter((t) => t.key).map((t) => (
                <option key={t.key} value={t.key} className="bg-[#0B0F14]">
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-white/45">级别</label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-brand-electric/40"
            >
              {SEVERITY_OPTIONS.map((s) => (
                <option key={s.value} value={s.value} className="bg-[#0B0F14]">
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {create.isError && (
          <p className="text-[11px] text-semantic-risk">创建失败，请稍后重试。</p>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={create.isPending || title.trim() === ""}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-brand px-4 py-2 text-xs font-medium text-white shadow-glow-blue transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className={create.isPending ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
            {create.isPending ? "创建中…" : "创建通知"}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-white/55 transition hover:text-white/85"
          >
            取消
          </button>
        </div>
      </div>
    </GlassCard>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3].map((i) => (
        <GlassCard key={i} className="h-24 animate-pulse p-4">
          <div className="h-full rounded-xl bg-white/[0.03]" />
        </GlassCard>
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <GlassCard className="p-10 text-center">
      <Inbox className="mx-auto h-8 w-8 text-white/20" />
      <p className="mt-3 text-sm font-medium text-white">{text}</p>
      <p className="mx-auto mt-1.5 max-w-md text-[12px] text-white/45">
        切换上方分类或状态筛选查看其它通知，也可以手动新建一条提醒。
      </p>
    </GlassCard>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <GlassCard className="p-10 text-center">
      <AlertTriangle className="mx-auto h-8 w-8 text-semantic-warn/70" />
      <p className="mt-3 text-sm font-medium text-white">通知加载失败</p>
      <p className="mx-auto mt-1.5 max-w-md text-[12px] text-white/45">
        可能是网络波动或登录状态已过期，请稍后重试。
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-2 rounded-full border border-brand-electric/30 bg-brand-electric/10 px-4 py-2 text-xs font-medium text-brand-electric transition hover:bg-brand-electric/20"
      >
        <BellOff className="h-3.5 w-3.5" /> 重新加载
      </button>
    </GlassCard>
  );
}
