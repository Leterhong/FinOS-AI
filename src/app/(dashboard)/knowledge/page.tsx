"use client";

// ── 个人知识中心（Phase 7.3）─────────────────────────────────────────────
// 数据层全部走 FastAPI Personal OS 后端（/personal-os/knowledge），
// 通过 @/hooks/use-backend 暴露的 hooks 访问，页面内不做任何直接 fetch。

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import PageTransition from "@/components/dashboard/PageTransition";
import GlassCard from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";
import {
  useKnowledge,
  useAddKnowledge,
  useUpdateKnowledge,
  useToggleKnowledgeFavorite,
  useDeleteKnowledge,
} from "@/hooks/use-backend";
import type { KnowledgeItem, KnowledgeList } from "@/types/personal_os";
import {
  BookOpen,
  Search,
  Star,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Tag,
  Link2,
} from "lucide-react";

const DISCLAIMER =
  "知识库内容为金融教育信息，不构成投资建议。市场有风险，决策需谨慎。";

const SUMMARY_LIMIT = 150;

interface CategoryOption {
  value: string;
  label: string;
}

/** 分类 Tab：value 为空字符串代表「全部」，下发时转 undefined */
const CATEGORY_TABS: CategoryOption[] = [
  { value: "", label: "全部" },
  { value: "investment", label: "投资" },
  { value: "insurance", label: "保险" },
  { value: "tax", label: "税务" },
  { value: "planning", label: "理财" },
  { value: "other", label: "其他" },
];

/** 表单可选分类（不含「全部」） */
const CATEGORY_OPTIONS: CategoryOption[] = CATEGORY_TABS.slice(1);

const CATEGORY_LABELS: Record<string, string> = {
  investment: "投资",
  insurance: "保险",
  tax: "税务",
  planning: "理财",
  other: "其他",
};

const SOURCE_LABELS: Record<string, string> = {
  chat: "AI 对话",
  ai: "AI 对话",
  conversation: "AI 对话",
  document: "文档",
  doc: "文档",
  manual: "手动添加",
  import: "导入",
};

function categoryLabel(value: string): string {
  return CATEGORY_LABELS[value] ?? (value || "未分类");
}

function sourceLabel(item: KnowledgeItem): string | null {
  const src = (item.source ?? "").trim();
  const ref = (item.sourceRef ?? "").trim();
  if (!src && !ref) return null;
  const base = src ? SOURCE_LABELS[src] ?? src : "";
  if (base && ref) return `来自${base} · ${ref}`;
  if (base) return `来自${base}`;
  return `来源：${ref}`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function KnowledgeCenterPage() {
  // ── 筛选状态 ────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [favoriteOnly, setFavoriteOnly] = useState<boolean>(false);

  // 300ms 防抖，避免每个字符都发请求
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const queryParams = useMemo(
    () => ({
      category: category || undefined,
      favorite: favoriteOnly ? true : undefined,
      q: debouncedQuery || undefined,
    }),
    [category, favoriteOnly, debouncedQuery]
  );

  const knowledgeQ = useKnowledge(queryParams);
  const list = knowledgeQ.data as KnowledgeList | undefined;
  const items: KnowledgeItem[] = list?.items ?? [];

  // ── mutations ──────────────────────────────────────────────
  const addM = useAddKnowledge();
  const updateM = useUpdateKnowledge();
  const favoriteM = useToggleKnowledgeFavorite();
  const deleteM = useDeleteKnowledge();

  // 按 id 精确追踪 pending，避免全局禁用
  const [pendingFavoriteId, setPendingFavoriteId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingUpdateId, setPendingUpdateId] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState<boolean>(false);

  const hasFilter =
    debouncedQuery.length > 0 || category !== "" || favoriteOnly;

  const handleToggleFavorite = async (id: string): Promise<void> => {
    setPendingFavoriteId(id);
    try {
      await favoriteM.mutateAsync(id);
    } catch {
      /* 错误由 query 层处理，页面保持现状 */
    } finally {
      setPendingFavoriteId(null);
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    setPendingDeleteId(id);
    try {
      await deleteM.mutateAsync(id);
      setConfirmDeleteId(null);
    } catch {
      /* 错误由 query 层处理 */
    } finally {
      setPendingDeleteId(null);
    }
  };

  const handleUpdate = async (
    id: string,
    patch: Record<string, unknown>
  ): Promise<void> => {
    setPendingUpdateId(id);
    try {
      await updateM.mutateAsync({ id, patch });
      setEditingId(null);
    } catch {
      /* 错误由 query 层处理 */
    } finally {
      setPendingUpdateId(null);
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
                <BookOpen className="h-4 w-4 text-white" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-white">
                金融知识中心
              </h1>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-white/55">
              你的私人金融知识库，沉淀 AI 对话与资料中的关键结论。
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-brand px-4 py-2 text-xs font-medium text-white shadow-glow-blue transition hover:opacity-90"
          >
            {showAddForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {showAddForm ? "收起表单" : "添加知识"}
          </button>
        </motion.div>

        {/* 添加知识表单 */}
        <AnimatePresence initial={false}>
          {showAddForm && (
            <motion.div
              key="add-form"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <AddKnowledgeForm
                pending={addM.isPending}
                onCancel={() => setShowAddForm(false)}
                onSubmit={async (body) => {
                  try {
                    await addM.mutateAsync(body);
                    setShowAddForm(false);
                  } catch {
                    /* 错误由 query 层处理 */
                  }
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* 搜索 + 筛选 */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.06 }}
          className="space-y-3.5 rounded-2xl border border-white/8 bg-white/[0.02] p-4"
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="搜索知识标题或正文，例如：指数基金定投"
              className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pl-10 pr-10 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-semantic-success/40"
            />
            {searchInput.length > 0 && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                aria-label="清除搜索"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 transition hover:text-white/70"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {CATEGORY_TABS.map((tab) => (
                <button
                  key={tab.value || "all"}
                  type="button"
                  onClick={() => setCategory(tab.value)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs transition",
                    category === tab.value
                      ? "border-semantic-success/40 bg-semantic-success/10 text-semantic-success"
                      : "border-white/10 bg-white/[0.03] text-white/50 hover:text-white/80"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setFavoriteOnly((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition",
                favoriteOnly
                  ? "border-semantic-success/40 bg-semantic-success/10 text-semantic-success"
                  : "border-white/10 bg-white/[0.03] text-white/50 hover:text-white/80"
              )}
            >
              <Star
                className={cn(
                  "h-3.5 w-3.5",
                  favoriteOnly && "fill-semantic-success"
                )}
              />
              仅看收藏
            </button>
          </div>
        </motion.div>

        {/* 主体状态分支 */}
        {knowledgeQ.isError ? (
          <ErrorState
            onRetry={() => {
              void knowledgeQ.refetch();
            }}
          />
        ) : knowledgeQ.isLoading ? (
          <LoadingGrid />
        ) : items.length === 0 ? (
          <EmptyState
            filtered={hasFilter}
            onAdd={() => setShowAddForm(true)}
            onReset={() => {
              setSearchInput("");
              setCategory("");
              setFavoriteOnly(false);
            }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {items.map((item, index) => (
                <KnowledgeCard
                  key={item.id}
                  item={item}
                  index={index}
                  editing={editingId === item.id}
                  confirmingDelete={confirmDeleteId === item.id}
                  favoritePending={pendingFavoriteId === item.id}
                  deletePending={pendingDeleteId === item.id}
                  updatePending={pendingUpdateId === item.id}
                  onToggleFavorite={() => {
                    void handleToggleFavorite(item.id);
                  }}
                  onStartEdit={() => {
                    setConfirmDeleteId(null);
                    setEditingId(item.id);
                  }}
                  onCancelEdit={() => setEditingId(null)}
                  onSaveEdit={(patch) => {
                    void handleUpdate(item.id, patch);
                  }}
                  onRequestDelete={() => {
                    setEditingId(null);
                    setConfirmDeleteId(item.id);
                  }}
                  onCancelDelete={() => setConfirmDeleteId(null)}
                  onConfirmDelete={() => {
                    void handleDelete(item.id);
                  }}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        <p className="pt-2 text-center text-[11px] text-white/30">{DISCLAIMER}</p>
      </div>
    </PageTransition>
  );
}

/* ───────────────────────── 子组件 ───────────────────────── */

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <GlassCard key={i} className="h-52 animate-pulse p-5" delay={i * 0.04}>
          <div className="h-full rounded-xl bg-white/[0.03]" />
        </GlassCard>
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <GlassCard className="p-12 text-center">
      <AlertTriangle className="mx-auto h-9 w-9 text-amber-300/70" />
      <p className="mt-4 text-base font-medium text-white">知识库加载失败</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
        无法连接到知识服务，可能是网络波动或登录状态失效。请稍后重试。
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-brand px-5 py-2.5 text-sm font-medium text-white shadow-glow-blue transition hover:opacity-90"
      >
        <RefreshCw className="h-4 w-4" /> 重新加载
      </button>
    </GlassCard>
  );
}

function EmptyState({
  filtered,
  onAdd,
  onReset,
}: {
  filtered: boolean;
  onAdd: () => void;
  onReset: () => void;
}) {
  if (filtered) {
    return (
      <GlassCard className="p-12 text-center">
        <Search className="mx-auto h-9 w-9 text-white/20" />
        <p className="mt-4 text-base font-medium text-white">
          没有匹配的知识条目
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
          试试其他关键词，或放宽分类与收藏筛选条件。
        </p>
        <button
          type="button"
          onClick={onReset}
          className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-white/80 transition hover:bg-white/[0.08]"
        >
          <RefreshCw className="h-4 w-4" /> 清除筛选条件
        </button>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="p-12 text-center">
      <BookOpen className="mx-auto h-9 w-9 text-white/20" />
      <p className="mt-4 text-base font-medium text-white">你的知识库还是空的</p>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-white/55">
        知识可以从 AI 对话与上传文档中自动沉淀——每当顾问给出关键结论，你都可以把它收进知识库；
        也可以现在手动录入一条你已经确认的金融认知。
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-brand px-5 py-2.5 text-sm font-medium text-white shadow-glow-blue transition hover:opacity-90"
      >
        <Plus className="h-4 w-4" /> 添加第一条知识
      </button>
    </GlassCard>
  );
}

interface EditPatch {
  title: string;
  content: string;
  category: string;
  tags: string[];
}

function KnowledgeCard({
  item,
  index,
  editing,
  confirmingDelete,
  favoritePending,
  deletePending,
  updatePending,
  onToggleFavorite,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  item: KnowledgeItem;
  index: number;
  editing: boolean;
  confirmingDelete: boolean;
  favoritePending: boolean;
  deletePending: boolean;
  updatePending: boolean;
  onToggleFavorite: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (patch: Record<string, unknown>) => void;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const [expanded, setExpanded] = useState<boolean>(false);
  const content = item.content ?? "";
  const isLong = content.length > SUMMARY_LIMIT;
  const shown = expanded || !isLong ? content : `${content.slice(0, SUMMARY_LIMIT)}…`;
  const origin = sourceLabel(item);
  const tags = item.tags ?? [];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.3), ease: [0.22, 1, 0.36, 1] }}
      className="group relative flex flex-col rounded-2xl glass p-5 text-white transition-colors hover:bg-white/[0.05]"
    >
      {editing ? (
        <EditKnowledgeForm
          item={item}
          pending={updatePending}
          onCancel={onCancelEdit}
          onSave={(patch: EditPatch) =>
            onSaveEdit({
              title: patch.title,
              content: patch.content,
              category: patch.category,
              tags: patch.tags,
            })
          }
        />
      ) : (
        <>
          {/* 标题 + 收藏 */}
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-sm font-semibold leading-snug text-white">
              {item.title}
            </h2>
            <button
              type="button"
              onClick={onToggleFavorite}
              disabled={favoritePending}
              aria-label={item.favorite ? "取消收藏" : "收藏"}
              className="shrink-0 rounded-lg p-1 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {favoritePending ? (
                <Loader2 className="h-4 w-4 animate-spin text-white/40" />
              ) : (
                <Star
                  className={cn(
                    "h-4 w-4 transition",
                    item.favorite
                      ? "fill-semantic-success text-semantic-success"
                      : "text-white/30 hover:text-white/60"
                  )}
                />
              )}
            </button>
          </div>

          {/* 分类 + 时间 */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="rounded-md bg-semantic-success/10 px-2 py-0.5 text-semantic-success">
              {categoryLabel(item.category)}
            </span>
            <span className="text-white/35">{formatDate(item.createdAt)}</span>
          </div>

          {/* 正文 */}
          <p className="mt-3 whitespace-pre-line text-[12.5px] leading-relaxed text-white/65">
            {shown}
          </p>
          {isLong && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-2 inline-flex w-fit items-center gap-1 text-[11px] text-semantic-success transition hover:opacity-80"
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-3 w-3" /> 收起
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" /> 展开全文
                </>
              )}
            </button>
          )}

          {/* 标签 */}
          {tags.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Tag className="h-3 w-3 text-white/25" />
              {tags.map((t) => (
                <span
                  key={t}
                  className="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-white/50"
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* 来源 */}
          {origin && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-white/35">
              <Link2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{origin}</span>
            </p>
          )}

          {/* 操作区 */}
          <div className="mt-auto pt-4">
            {confirmingDelete ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-semantic-risk/25 bg-semantic-risk/[0.07] px-3 py-2">
                <span className="text-[11px] text-white/70">确认删除这条知识？</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={onConfirmDelete}
                    disabled={deletePending}
                    className="inline-flex items-center gap-1 rounded-md bg-semantic-risk/20 px-2 py-1 text-[11px] text-semantic-risk transition hover:bg-semantic-risk/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deletePending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                    删除
                  </button>
                  <button
                    type="button"
                    onClick={onCancelDelete}
                    disabled={deletePending}
                    className="rounded-md bg-white/[0.06] px-2 py-1 text-[11px] text-white/60 transition hover:bg-white/[0.1] disabled:opacity-50"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onStartEdit}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-white/60 transition hover:text-white/90"
                >
                  <Pencil className="h-3 w-3" /> 编辑
                </button>
                <button
                  type="button"
                  onClick={onRequestDelete}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-white/45 transition hover:border-semantic-risk/30 hover:text-semantic-risk"
                >
                  <Trash2 className="h-3 w-3" /> 删除
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </motion.div>
  );
}

function EditKnowledgeForm({
  item,
  pending,
  onCancel,
  onSave,
}: {
  item: KnowledgeItem;
  pending: boolean;
  onCancel: () => void;
  onSave: (patch: EditPatch) => void;
}) {
  const [title, setTitle] = useState<string>(item.title ?? "");
  const [content, setContent] = useState<string>(item.content ?? "");
  const [category, setCategory] = useState<string>(item.category || "other");
  const [tagsRaw, setTagsRaw] = useState<string>((item.tags ?? []).join(", "));

  const valid = title.trim().length > 0 && content.trim().length > 0;

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-white/40">
        编辑知识
      </p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="标题"
        className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-semantic-success/40"
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={6}
        placeholder="正文内容"
        className="w-full resize-y rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12.5px] leading-relaxed text-white outline-none transition placeholder:text-white/25 focus:border-semantic-success/40"
      />
      <div className="grid grid-cols-2 gap-2.5">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white outline-none transition focus:border-semantic-success/40"
        >
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c.value} value={c.value} className="bg-surface-elevated">
              {c.label}
            </option>
          ))}
        </select>
        <input
          value={tagsRaw}
          onChange={(e) => setTagsRaw(e.target.value)}
          placeholder="标签，逗号分隔"
          className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white outline-none transition placeholder:text-white/25 focus:border-semantic-success/40"
        />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!valid || pending}
          onClick={() =>
            onSave({
              title: title.trim(),
              content: content.trim(),
              category,
              tags: parseTags(tagsRaw),
            })
          }
          className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-brand px-3 py-1.5 text-[11px] font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          保存
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/60 transition hover:text-white/90 disabled:opacity-50"
        >
          取消
        </button>
      </div>
    </div>
  );
}

interface AddPayload {
  title: string;
  content: string;
  source?: string;
  category?: string;
  tags?: string[];
  sourceRef?: string;
}

function AddKnowledgeForm({
  pending,
  onCancel,
  onSubmit,
}: {
  pending: boolean;
  onCancel: () => void;
  onSubmit: (body: AddPayload) => void;
}) {
  const [title, setTitle] = useState<string>("");
  const [content, setContent] = useState<string>("");
  const [category, setCategory] = useState<string>("investment");
  const [tagsRaw, setTagsRaw] = useState<string>("");
  const [source, setSource] = useState<string>("");

  const valid = title.trim().length > 0 && content.trim().length > 0;

  const submit = (): void => {
    if (!valid || pending) return;
    onSubmit({
      title: title.trim(),
      content: content.trim(),
      category,
      tags: parseTags(tagsRaw),
      source: source.trim() || "manual",
    });
    setTitle("");
    setContent("");
    setTagsRaw("");
    setSource("");
  };

  return (
    <div className="rounded-2xl glass p-5">
      <div className="mb-4 flex items-center gap-2">
        <Plus className="h-4 w-4 text-semantic-success" />
        <h2 className="text-sm font-semibold text-white">添加知识</h2>
        <span className="text-[11px] text-white/35">
          沉淀一条你已经确认的金融认知
        </span>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-[11px] text-white/45">标题（必填）</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：应急资金应覆盖 6 个月刚性支出"
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-semantic-success/40"
          />
        </div>

        <div>
          <label className="text-[11px] text-white/45">正文（必填）</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            placeholder="记录结论、推导过程与适用前提，便于日后复用。"
            className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12.5px] leading-relaxed text-white outline-none transition placeholder:text-white/25 focus:border-semantic-success/40"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="text-[11px] text-white/45">分类</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white outline-none transition focus:border-semantic-success/40"
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value} className="bg-surface-elevated">
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-white/45">标签（逗号分隔）</label>
            <input
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="现金流, 风险管理"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white outline-none transition placeholder:text-white/25 focus:border-semantic-success/40"
            />
          </div>
          <div>
            <label className="text-[11px] text-white/45">来源（选填）</label>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="默认 manual"
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white outline-none transition placeholder:text-white/25 focus:border-semantic-success/40"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={submit}
            disabled={!valid || pending}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-brand px-4 py-2 text-xs font-medium text-white shadow-glow-blue transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {pending ? "保存中…" : "保存到知识库"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-white/60 transition hover:text-white/90 disabled:opacity-50"
          >
            取消
          </button>
          {!valid && (
            <span className="text-[11px] text-white/30">
              标题与正文均为必填
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
