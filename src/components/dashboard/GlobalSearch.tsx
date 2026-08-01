"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Loader2, CornerDownLeft, X } from "lucide-react";
import { useGlobalSearch } from "@/hooks/use-backend";
import { cn } from "@/lib/utils";

/**
 * Phase 7.3 全局搜索（Personal OS）。
 * 一个入口搜遍记忆 / 知识 / 时间线 / 决策 / 方案版本，命中后直达对应模块。
 * 交互：⌘K / Ctrl+K 聚焦，↑↓ 选择，Enter 跳转，Esc 关闭。
 */

/** 后端 results 的分组 key → 中文标签 + 目标路由 */
const GROUP_META: Record<string, { label: string; href: string }> = {
  memory: { label: "AI 记忆", href: "/memory" },
  memories: { label: "AI 记忆", href: "/memory" },
  knowledge: { label: "金融知识", href: "/knowledge" },
  timeline: { label: "财富时间线", href: "/timeline" },
  event: { label: "人生事件", href: "/timeline" },
  events: { label: "人生事件", href: "/timeline" },
  decision: { label: "决策记录", href: "/wealth-lab" },
  decisions: { label: "决策记录", href: "/wealth-lab" },
  plan: { label: "方案版本", href: "/wealth-lab" },
  plans: { label: "方案版本", href: "/wealth-lab" },
  planVersion: { label: "方案版本", href: "/wealth-lab" },
  notification: { label: "通知", href: "/notifications" },
  notifications: { label: "通知", href: "/notifications" },
  document: { label: "资料", href: "/documents" },
  documents: { label: "资料", href: "/documents" },
  asset: { label: "资产", href: "/data" },
  assets: { label: "资产", href: "/data" },
  report: { label: "财富报告", href: "/report" },
  reports: { label: "财富报告", href: "/report" },
  file: { label: "文件", href: "/documents" },
  files: { label: "文件", href: "/documents" },
  goal: { label: "财富目标", href: "/twin" },
  goals: { label: "财富目标", href: "/twin" },
};

function groupLabel(key: string): string {
  return GROUP_META[key]?.label ?? key;
}

function groupHref(key: string): string {
  return GROUP_META[key]?.href ?? "/";
}

interface FlatHit {
  groupKey: string;
  id: string;
  type: string;
  title: string;
  detail: string;
}

export default function GlobalSearch() {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // 300ms 防抖，避免逐字符打后端
  useEffect(() => {
    const t = setTimeout(() => setQuery(raw.trim()), 300);
    return () => clearTimeout(t);
  }, [raw]);

  const { data, isFetching } = useGlobalSearch(query);

  const hits: FlatHit[] = useMemo(() => {
    const results = data?.results;
    if (!results) return [];
    const flat: FlatHit[] = [];
    Object.entries(results).forEach(([groupKey, items]) => {
      (items ?? []).forEach((it) => {
        flat.push({
          groupKey,
          id: it.id,
          type: it.type,
          title: it.title,
          detail: it.detail,
        });
      });
    });
    return flat;
  }, [data]);

  // 按分组重新聚合（保持后端顺序），用于分节渲染
  const grouped = useMemo(() => {
    const map = new Map<string, FlatHit[]>();
    hits.forEach((h) => {
      const list = map.get(h.groupKey);
      if (list) list.push(h);
      else map.set(h.groupKey, [h]);
    });
    return Array.from(map.entries());
  }, [hits]);

  useEffect(() => {
    setCursor(0);
  }, [query, hits.length]);

  // ⌘K / Ctrl+K 全局聚焦
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go = (hit: FlatHit) => {
    setOpen(false);
    setRaw("");
    setQuery("");
    router.push(groupHref(hit.groupKey));
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!hits.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (c + 1) % hits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (c - 1 + hits.length) % hits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[cursor];
      if (hit) go(hit);
    }
  };

  const showPanel = open && query.length > 0;
  let flatIndex = -1;

  return (
    <div className="relative hidden min-w-0 flex-1 justify-center md:flex">
      <div className="relative w-full max-w-md">
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 transition-colors",
            open && "border-semantic-success/30 bg-white/[0.05]"
          )}
        >
          {isFetching ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-semantic-success" />
          ) : (
            <Search className="h-4 w-4 shrink-0 text-white/40" />
          )}
          <input
            ref={inputRef}
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onInputKeyDown}
            placeholder="搜索记忆 / 知识 / 时间线 / 决策…"
            className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/30 focus:outline-none"
          />
          {raw ? (
            <button
              type="button"
              onClick={() => {
                setRaw("");
                setQuery("");
                inputRef.current?.focus();
              }}
              className="shrink-0 rounded-md p-0.5 text-white/30 transition hover:text-white/70"
              aria-label="清空搜索"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="hidden shrink-0 rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-white/30 lg:block">
              ⌘K
            </kbd>
          )}
        </div>

        <AnimatePresence>
          {showPanel && (
            <>
              <div
                aria-hidden
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setOpen(false)}
              />
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={{ duration: 0.16 }}
                className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-2xl border border-white/10 bg-[#0e1420]/95 shadow-2xl backdrop-blur-xl"
              >
                <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
                  <p className="text-[11px] text-white/40">
                    {isFetching
                      ? "搜索中…"
                      : `找到 ${data?.total ?? hits.length} 条结果`}
                  </p>
                  <span className="hidden items-center gap-1 text-[10px] text-white/25 sm:flex">
                    <CornerDownLeft className="h-2.5 w-2.5" /> 回车打开
                  </span>
                </div>

                <div className="max-h-[22rem] overflow-y-auto p-1.5">
                  {!isFetching && hits.length === 0 ? (
                    <div className="px-3 py-8 text-center">
                      <Search className="mx-auto h-5 w-5 text-white/20" />
                      <p className="mt-2 text-xs text-white/40">
                        没有找到与「{query}」相关的内容
                      </p>
                      <p className="mt-1 text-[10px] text-white/25">
                        试试财富目标、资产名称或某次决策的关键词
                      </p>
                    </div>
                  ) : (
                    grouped.map(([groupKey, items]) => (
                      <div key={groupKey} className="mb-1 last:mb-0">
                        <p className="px-2 py-1 text-[10px] uppercase tracking-wide text-white/30">
                          {groupLabel(groupKey)}
                          <span className="ml-1.5 text-white/20">
                            {items.length}
                          </span>
                        </p>
                        {items.map((hit) => {
                          flatIndex += 1;
                          const activeRow = flatIndex === cursor;
                          return (
                            <button
                              key={`${groupKey}-${hit.id}`}
                              type="button"
                              onClick={() => go(hit)}
                              onMouseEnter={() => setCursor(hits.indexOf(hit))}
                              className={cn(
                                "flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left transition-colors",
                                activeRow
                                  ? "bg-semantic-success/10"
                                  : "hover:bg-white/[0.04]"
                              )}
                            >
                              <span
                                className={cn(
                                  "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                                  activeRow
                                    ? "bg-semantic-success"
                                    : "bg-white/25"
                                )}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs text-white/90">
                                  {hit.title}
                                </span>
                                {hit.detail && (
                                  <span className="mt-0.5 line-clamp-2 block text-[10px] leading-snug text-white/35">
                                    {hit.detail}
                                  </span>
                                )}
                              </span>
                            </button>
                          );
                        })
                      }
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
