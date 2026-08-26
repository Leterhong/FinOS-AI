"use client";

// ── AI 记忆中心（Phase 7.3）────────────────────────────────────────────────
// 数据层完全走 FastAPI Personal OS 后端（/personal-os/memory），分类体系为
// kind：preference / life_stage / decision / wealth_change。
// 视觉语言严格对齐 Phase 7.1 财富实验室。

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import PageTransition from "@/components/dashboard/PageTransition";
import GlassCard from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";
import {
  useMemory,
  useAddMemory,
  useUpdateMemory,
  useDeleteMemory,
} from "@/hooks/use-backend";
import type { MemoryItem, MemoryGroup } from "@/types/personal_os";
import {
  Brain,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  ChevronDown,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  Loader2,
  ShieldCheck,
} from "lucide-react";

/* ───────────────────────── 常量 ───────────────────────── */

const KIND_FALLBACK_LABELS: Record<string, string> = {
  preference: "偏好",
  life_stage: "人生阶段",
  decision: "决策",
  wealth_change: "财富变动",
};

const KIND_ORDER: string[] = ["preference", "life_stage", "decision", "wealth_change"];

const TABS: { key: string | undefined; label: string }[] = [
  { key: undefined, label: "全部" },
  { key: "preference", label: "偏好" },
  { key: "life_stage", label: "人生阶段" },
  { key: "decision", label: "决策" },
  { key: "wealth_change", label: "财富变动" },
];

/* ───────────────────────── 工具函数 ───────────────────────── */

function resolveLabel(kind: string, labels: Record<string, string>): string {
  return labels[kind] ?? KIND_FALLBACK_LABELS[kind] ?? kind;
}

function formatTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN", { hour12: false });
}

function hasPayload(payload?: Record<string, unknown>): boolean {
  return !!payload && Object.keys(payload).length > 0;
}

/* ───────────────────────── 页面 ───────────────────────── */

export default function MemoryCenterPage() {
  const [activeKind, setActiveKind] = useState<string | undefined>(undefined);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const memoryQ = useMemory(activeKind);
  const data = memoryQ.data as MemoryGroup | undefined;

  const updateM = useUpdateMemory();
  const deleteM = useDeleteMemory();

  const groups = useMemo<Record<string, MemoryItem[]>>(
    () => data?.groups ?? {},
    [data?.groups]
  );
  const labels: Record<string, string> = data?.labels ?? {};

  const orderedKinds = useMemo<string[]>(() => {
    const keys = Object.keys(groups).filter((k) => (groups[k] ?? []).length > 0);
    return keys.sort((a, b) => {
      const ia = KIND_ORDER.indexOf(a);
      const ib = KIND_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  }, [groups]);

  const total = useMemo<number>(
    () => Object.values(groups).reduce((sum, list) => sum + (list?.length ?? 0), 0),
    [groups]
  );

  const hasData = data?.hasData === true;

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
                <Brain className="h-4 w-4 text-white" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-white">AI 记忆中心</h1>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-white/55">
              AI 记住的关于你的一切，你可以随时查看、修改与删除。
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/55 sm:inline-flex">
              <ShieldCheck className="h-3 w-3" /> 共 {total} 条 · 仅你自己可见
            </span>
            <button
              type="button"
              onClick={() => setAddOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-full border border-brand-electric/30 bg-brand-electric/10 px-4 py-2 text-xs font-medium text-brand-electric transition hover:bg-brand-electric/20"
            >
              {addOpen ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {addOpen ? "收起表单" : "添加记忆"}
            </button>
          </div>
        </motion.div>

        {/* 隐私说明 */}
        <div className="flex items-start gap-2.5 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-electric/80" />
          <p className="text-[12px] leading-relaxed text-white/55">
            这些记忆用于让 AI 更准确地理解你的处境与偏好。所有条目均可被你随时修改或彻底删除，
            删除后 AI 在后续对话与分析中将不再引用。
          </p>
        </div>

        {/* kind 筛选 Tab */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="flex flex-wrap gap-2"
        >
          {TABS.map((t) => {
            const active = activeKind === t.key;
            return (
              <button
                key={t.key ?? "all"}
                type="button"
                onClick={() => {
                  setActiveKind(t.key);
                  setEditingId(null);
                  setConfirmId(null);
                }}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs transition",
                  active
                    ? "border-brand-electric/40 bg-brand-electric/10 text-brand-electric"
                    : "border-white/10 bg-white/[0.03] text-white/50 hover:text-white/80"
                )}
              >
                {t.label}
              </button>
            );
          })}
        </motion.div>

        {/* 添加记忆表单 */}
        <AnimatePresence initial={false}>
          {addOpen && (
            <motion.div
              key="add-form"
              initial={{ opacity: 0, y: -8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -8, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <AddMemoryForm onDone={() => setAddOpen(false)} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* 主体 */}
        {memoryQ.isLoading ? (
          <LoadingState />
        ) : memoryQ.isError ? (
          <ErrorState onRetry={() => void memoryQ.refetch()} />
        ) : !hasData ? (
          <WelcomeState onManualAdd={() => setAddOpen(true)} />
        ) : orderedKinds.length === 0 ? (
          <GlassCard className="p-12 text-center">
            <Brain className="mx-auto h-8 w-8 text-white/20" />
            <p className="mt-4 text-sm text-white/55">该分类下暂无记忆</p>
            <p className="mx-auto mt-1.5 max-w-md text-[12px] text-white/35">
              切换到其他分类查看，或点击右上角「添加记忆」手动补充一条。
            </p>
          </GlassCard>
        ) : (
          <div className="space-y-6">
            {orderedKinds.map((kind, gi) => {
              const list = groups[kind] ?? [];
              return (
                <motion.div
                  key={kind}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.06 * gi }}
                >
                  <GlassCard className="p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-brand-electric">
                          <Brain className="h-4 w-4" />
                        </span>
                        <h2 className="text-sm font-semibold text-white">
                          {resolveLabel(kind, labels)}
                        </h2>
                        <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/50">
                          {list.length}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      <AnimatePresence initial={false}>
                        {list.map((item) => (
                          <MemoryCard
                            key={item.id}
                            item={item}
                            editing={editingId === item.id}
                            confirming={confirmId === item.id}
                            updating={updateM.isPending && editingId === item.id}
                            deleting={deleteM.isPending && confirmId === item.id}
                            onStartEdit={() => {
                              setEditingId(item.id);
                              setConfirmId(null);
                            }}
                            onCancelEdit={() => setEditingId(null)}
                            onSubmitEdit={(content) => {
                              updateM.mutate(
                                { id: item.id, content },
                                { onSuccess: () => setEditingId(null) }
                              );
                            }}
                            onAskDelete={() => {
                              setConfirmId(item.id);
                              setEditingId(null);
                            }}
                            onCancelDelete={() => setConfirmId(null)}
                            onConfirmDelete={() => {
                              deleteM.mutate(item.id, {
                                onSuccess: () => setConfirmId(null),
                              });
                            }}
                          />
                        ))}
                      </AnimatePresence>
                    </div>
                  </GlassCard>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </PageTransition>
  );
}

/* ───────────────────────── 记忆条目卡片 ───────────────────────── */

function MemoryCard({
  item,
  editing,
  confirming,
  updating,
  deleting,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  item: MemoryItem;
  editing: boolean;
  confirming: boolean;
  updating: boolean;
  deleting: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSubmitEdit: (content: string) => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const [draft, setDraft] = useState<string>(item.content);
  const [detailOpen, setDetailOpen] = useState(false);

  const important = item.importance >= 4;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -12, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.25 }}
      className={cn(
        "overflow-hidden rounded-xl bg-white/[0.03] p-4 ring-1 transition",
        important
          ? "ring-brand-electric/30 hover:ring-brand-electric/45"
          : "ring-white/10 hover:ring-white/20"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-[11px] tracking-wide text-brand-electric/85">
            {item.key}
          </p>

          {editing ? (
            <div className="mt-2 space-y-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px] leading-relaxed text-white outline-none focus:border-brand-electric/40"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(item.content);
                    onCancelEdit();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/60 transition hover:text-white/85"
                >
                  <X className="h-3 w-3" /> 取消
                </button>
                <button
                  type="button"
                  disabled={updating || draft.trim().length === 0}
                  onClick={() => onSubmitEdit(draft.trim())}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-brand px-3 py-1.5 text-[11px] font-medium text-white shadow-glow-blue transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {updating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                  保存
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-white/80">
              {item.content}
            </p>
          )}
        </div>

        {!editing && (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={onStartEdit}
              title="编辑"
              className="rounded-md p-1.5 text-white/35 transition hover:bg-white/[0.06] hover:text-brand-electric"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onAskDelete}
              disabled={deleting}
              title="删除"
              className="rounded-md p-1.5 text-white/35 transition hover:bg-rose-400/10 hover:text-rose-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {deleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        )}
      </div>

      {/* 元信息 */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-white/35">
        <ImportanceDots value={item.importance} />
        {typeof item.hitCount === "number" && item.hitCount > 0 && (
          <span>被引用 {item.hitCount} 次</span>
        )}
        <span>更新于 {formatTime(item.updatedAt)}</span>
        {hasPayload(item.payload) && (
          <button
            type="button"
            onClick={() => setDetailOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-white/45 transition hover:text-brand-electric"
          >
            <ChevronDown
              className={cn("h-3 w-3 transition-transform", detailOpen && "rotate-180")}
            />
            查看详情
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {detailOpen && hasPayload(item.payload) && (
          <motion.div
            key="payload"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <pre className="scrollbar-thin mt-2.5 max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/30 p-3 font-mono text-[10.5px] leading-relaxed text-white/55 ring-1 ring-white/10">
              {JSON.stringify(item.payload ?? {}, null, 2)}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 删除二次确认 */}
      <AnimatePresence initial={false}>
        {confirming && (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-400/25 bg-rose-400/[0.06] px-3 py-2.5">
              <span className="inline-flex items-center gap-1.5 text-[11px] text-rose-300/90">
                <AlertTriangle className="h-3 w-3" />
                删除后不可恢复，AI 将不再引用这条记忆。
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onCancelDelete}
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-white/60 transition hover:text-white/85"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={onConfirmDelete}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/85 px-3 py-1 text-[11px] font-medium text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  确认删除
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ImportanceDots({ value }: { value: number }) {
  const level = Math.max(1, Math.min(5, Math.round(value || 1)));
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-white/35">重要度</span>
      <span className="inline-flex items-center gap-[3px]">
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              n <= level ? "bg-brand-electric" : "bg-white/15"
            )}
          />
        ))}
      </span>
    </span>
  );
}

/* ───────────────────────── 添加记忆表单 ───────────────────────── */

function AddMemoryForm({ onDone }: { onDone: () => void }) {
  const addM = useAddMemory();
  const [kind, setKind] = useState<string>("preference");
  const [key, setKey] = useState("");
  const [content, setContent] = useState("");
  const [importance, setImportance] = useState(3);

  const valid = key.trim().length > 0 && content.trim().length > 0;

  const submit = () => {
    if (!valid || addM.isPending) return;
    addM.mutate(
      {
        kind,
        key: key.trim(),
        content: content.trim(),
        importance,
      },
      {
        onSuccess: () => {
          setKey("");
          setContent("");
          setImportance(3);
          setKind("preference");
          onDone();
        },
      }
    );
  };

  return (
    <GlassCard className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-brand-electric">
          <Plus className="h-4 w-4" />
        </span>
        <h2 className="text-sm font-semibold text-white">手动添加一条记忆</h2>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="text-[11px] text-white/45">分类</label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none focus:border-brand-electric/40"
          >
            {KIND_ORDER.map((k) => (
              <option key={k} value={k} className="bg-[#0B0E13]">
                {KIND_FALLBACK_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] text-white/45">标识 key（必填）</label>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="如 risk_tolerance"
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-sm text-white outline-none placeholder:font-sans placeholder:text-white/25 focus:border-brand-electric/40"
          />
        </div>
      </div>

      <div className="mt-3">
        <label className="text-[11px] text-white/45">内容（必填）</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          placeholder="如：偏好稳健，能接受的最大年度回撤约 10%"
          className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm leading-relaxed text-white outline-none placeholder:text-white/25 focus:border-brand-electric/40"
        />
      </div>

      <div className="mt-3">
        <label className="text-[11px] text-white/45">重要度：{importance}</label>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={importance}
          onChange={(e) => setImportance(Number(e.target.value))}
          className="mt-2 w-full accent-brand-electric md:w-64"
        />
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        {addM.isError && (
          <span className="mr-auto text-[11px] text-rose-300/90">添加失败，请稍后重试。</span>
        )}
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs text-white/60 transition hover:text-white/85"
        >
          取消
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!valid || addM.isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-brand px-4 py-2 text-xs font-medium text-white shadow-glow-blue transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {addM.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          添加记忆
        </button>
      </div>
    </GlassCard>
  );
}

/* ───────────────────────── 状态分支 ───────────────────────── */

function LoadingState() {
  return (
    <div className="space-y-6">
      {[0, 1].map((i) => (
        <GlassCard key={i} className="h-56 animate-pulse p-5">
          <div className="h-full rounded-xl bg-white/[0.03]" />
        </GlassCard>
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <GlassCard className="p-10 text-center">
      <AlertTriangle className="mx-auto h-8 w-8 text-amber-300/80" />
      <p className="mt-4 text-base font-medium text-white">记忆加载失败</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
        无法连接到记忆服务，你的数据没有受到影响。请检查网络后重试。
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex items-center gap-2 rounded-full border border-brand-electric/30 bg-brand-electric/10 px-5 py-2.5 text-sm font-medium text-brand-electric transition hover:bg-brand-electric/20"
      >
        <RefreshCw className="h-4 w-4" /> 重试
      </button>
    </GlassCard>
  );
}

function WelcomeState({ onManualAdd }: { onManualAdd: () => void }) {
  return (
    <GlassCard className="p-12 text-center">
      <Brain className="mx-auto h-9 w-9 text-white/20" />
      <p className="mt-4 text-base font-medium text-white">欢迎创建你的财富数字分身</p>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-white/55">
        AI 会在你日常使用的过程中，自动沉淀关于你的偏好、人生阶段、重要决策与财富变动；
        你也可以现在就手动添加第一条记忆，让它更快认识你。
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <a
          href="/onboarding"
          className="inline-flex items-center gap-2 rounded-full bg-gradient-brand px-5 py-2.5 text-sm font-medium text-white shadow-glow-blue transition hover:opacity-90"
        >
          <Sparkles className="h-4 w-4" /> 创建财富数字分身
        </a>
        <button
          type="button"
          onClick={onManualAdd}
          className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.03] px-5 py-2.5 text-sm text-white/70 transition hover:text-white"
        >
          <Plus className="h-4 w-4" /> 手动添加记忆
        </button>
      </div>
    </GlassCard>
  );
}
