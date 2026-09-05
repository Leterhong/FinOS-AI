"use client";

/**
 * EnterpriseDataTable：统一数据表格（2.2 第三十四节）。
 *
 * 内建：加载 / 空 / 错误三态、关键词搜索（searchable 字段）、列排序、
 * 分页、自定义行渲染；不依赖第三方表格库。
 * 列可见性与批量操作由调用方按需扩展，本组件预留 rows 全量数据。
 */
import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DataTableColumn<Row> {
  key: string;
  header: string;
  /** 排序取值（缺省按渲染值排序）。 */
  sortValue?: (row: Row) => string | number;
  /** 是否参与关键词搜索（默认 true）。 */
  searchable?: boolean;
  className?: string;
  render: (row: Row) => React.ReactNode;
}

export function EnterpriseDataTable<Row extends { id: string }>({
  columns,
  rows,
  rowKey,
  loading = false,
  error,
  emptyTitle = "暂无数据",
  emptyDescription,
  pageSize = 10,
  onRowClick,
  toolbar,
  /** 传入时启用行展开：返回该行的展开内容（如 Visual View / 详情）。 */
  expandedRowRender,
  /** 受控行展开 id（配合 onExpandedChange）；不传则由组件内部管理。 */
  expandedId: controlledExpandedId,
  onExpandedChange,
}: {
  columns: Array<DataTableColumn<Row>>;
  rows: Row[];
  rowKey: (row: Row) => string;
  loading?: boolean;
  error?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
  pageSize?: number;
  onRowClick?: (row: Row) => void;
  /** 顶栏右侧自定义区域（如筛选、批量操作）。 */
  toolbar?: React.ReactNode;
  expandedRowRender?: (row: Row) => React.ReactNode;
  expandedId?: string | null;
  onExpandedChange?: (id: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [innerExpandedId, setInnerExpandedId] = useState<string | null>(null);
  const expandedId = controlledExpandedId !== undefined ? controlledExpandedId : innerExpandedId;
  const setExpandedId = (id: string | null) => {
    if (onExpandedChange) onExpandedChange(id);
    else setInnerExpandedId(id);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      columns.some((column) => {
        if (column.searchable === false) return false;
        const sample = column.sortValue?.(row);
        const text = sample != null ? String(sample) : "";
        return text.toLowerCase().includes(q);
      })
    );
  }, [rows, columns, query]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const column = columns.find((c) => c.key === sortKey);
    if (!column) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = column.sortValue?.(a) ?? "";
      const bv = column.sortValue?.(b) ?? "";
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "zh-CN") * dir;
    });
  }, [filtered, columns, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const toggleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey(null);
      setSortDir("asc");
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-5 py-3">
        <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 sm:max-w-xs">
          <Search className="h-3 w-3 shrink-0 text-slate-600" />
          <input
            value={query}
            onChange={(event) => { setQuery(event.target.value); setPage(0); }}
            placeholder="搜索…"
            aria-label="表格搜索"
            className="min-w-0 flex-1 bg-transparent text-[11px] text-slate-200 outline-none placeholder:text-slate-700"
          />
        </label>
        {toolbar}
        <span className="ml-auto shrink-0 text-[10px] text-slate-600">{sorted.length} 条</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 p-12 text-xs text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />正在加载数据
        </div>
      ) : error ? (
        <div role="alert" className="m-5 rounded-xl border border-rose-400/20 bg-rose-400/[0.05] px-4 py-3 text-xs text-rose-200">{error}</div>
      ) : pageRows.length === 0 ? (
        <div className="p-12 text-center">
          <p className="text-sm text-slate-300">{emptyTitle}</p>
          {emptyDescription && <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-600">{emptyDescription}</p>}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[11px]">
            <thead>
              <tr className="border-y border-white/[0.06] bg-white/[0.02]">
                {columns.map((column) => {
                  const sortable = Boolean(column.sortValue);
                  const active = sortKey === column.key;
                  return (
                    <th key={column.key} className={cn("px-4 py-2.5 font-medium text-slate-500", column.className)}>
                      {sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(column.key)}
                          className={cn("inline-flex items-center gap-1 transition hover:text-slate-300", active && "text-cyan-200")}
                          aria-label={`按 ${column.header} 排序`}
                        >
                          {column.header}
                          {active ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronDown className="h-3 w-3 opacity-30" />}
                        </button>
                      ) : (
                        column.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => {
                const rowId = rowKey(row);
                const isExpanded = expandedRowRender != null && expandedId === rowId;
                return (
                  <Fragment key={rowId}>
                    <tr
                      onClick={onRowClick ? () => onRowClick(row) : expandedRowRender ? () => setExpandedId(isExpanded ? null : rowId) : undefined}
                      className={cn(
                        "border-t border-white/[0.04] transition hover:bg-white/[0.03]",
                        (onRowClick || expandedRowRender) && "cursor-pointer",
                        isExpanded && "bg-white/[0.03]"
                      )}
                    >
                      {columns.map((column) => (
                        <td key={column.key} className={cn("px-4 py-3 align-middle", column.className)}>
                          {column.render(row)}
                        </td>
                      ))}
                    </tr>
                    {isExpanded && (
                      <tr className="border-t border-white/[0.04] bg-black/20">
                        <td colSpan={columns.length} className="px-5 py-4">
                          {expandedRowRender!(row)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between border-t border-white/[0.05] px-5 py-2.5 text-[10px] text-slate-600">
          <span>第 {safePage + 1} / {pageCount} 页</span>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} className="rounded-md border border-white/[0.08] px-2.5 py-1 transition hover:text-slate-300 disabled:opacity-30">上一页</button>
            <button type="button" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1} className="rounded-md border border-white/[0.08] px-2.5 py-1 transition hover:text-slate-300 disabled:opacity-30">下一页</button>
          </div>
        </div>
      )}
    </div>
  );
}
