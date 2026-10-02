"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, Bell, CheckCheck, Trash2 } from "lucide-react";
import { EmptyStateCard, PageIntro, Panel } from "@/components/enterprise/EnterpriseUI";
import { Select } from "@/components/ui/Select";
import { backendAuthedFetch } from "@/lib/enterprise-sync";
import { Skeleton } from "@/components/feedback/Skeleton";
import { Tooltip } from "@/components/ui/Tooltip";
import { toast } from "@/components/feedback/toast";
import { ensureWorkspaceSession } from "@/lib/workspace-session";

interface Notice {
  id: string;
  source: string;
  category: string;
  severity: string;
  title: string;
  body: string;
  read: boolean;
  archived: boolean;
  createdAt?: string;
}

const CATEGORY_LABEL: Record<string, string> = { wealth: "财富", risk: "风险", goal: "目标", ai: "AI 提醒", system: "系统" };
const SEVERITY_CLASS: Record<string, string> = {
  critical: "border-rose-400/25 text-rose-300",
  high: "border-rose-400/20 text-rose-300",
  medium: "border-amber-400/20 text-amber-200",
  low: "border-emerald-400/20 text-emerald-300",
  info: "border-white/10 text-slate-400",
  warn: "border-amber-400/20 text-amber-200",
};

export default function NotificationsPage() {
  const [items, setItems] = useState<Notice[]>([]);
  const [category, setCategory] = useState("");
  const [archived, setArchived] = useState("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError("");
    try {
      await ensureWorkspaceSession();
      const query = new URLSearchParams();
      if (category) query.set("category", category);
      if (archived === "active") query.set("archived", "false");
      if (archived === "archived") query.set("archived", "true");
      const resp = await backendAuthedFetch(`/api/notifications${query.toString() ? `?${query}` : ""}`);
      const payload = await resp.json() as { data?: { notifications?: Notice[] }; error?: string };
      if (seq !== loadSeq.current) return; // 筛选已切换，丢弃过期响应
      if (!resp.ok) throw new Error(payload?.error || "加载通知失败");
      setItems(payload.data?.notifications ?? []);
    } catch (reason) {
      if (seq === loadSeq.current) setError(reason instanceof Error ? reason.message : "加载通知失败");
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [category, archived]);

  useEffect(() => { void load(); }, [load]);

  const act = async (id: string, action: "read" | "archive" | "delete") => {
    try {
      const resp = action === "delete"
        ? await backendAuthedFetch(`/api/notifications/${encodeURIComponent(id)}`, { method: "DELETE" })
        : await backendAuthedFetch(`/api/notifications/${encodeURIComponent(id)}/${action}`, { method: "POST" });
      if (!resp.ok) throw new Error("操作失败");
      await load();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "操作失败");
    }
  };

  const readAll = async () => {
    try {
      const resp = await backendAuthedFetch(`/api/notifications/read-all${category ? `?category=${encodeURIComponent(category)}` : ""}`, { method: "POST" });
      if (!resp.ok) throw new Error("操作失败");
      toast.success("已全部标记为已读");
      await load();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "操作失败");
    }
  };

  const unread = items.filter((item) => !item.read).length;

  return <div className="page-shell">
    <PageIntro
      eyebrow="Notification center"
      title="通知中心"
      description="聚合组织邀请、风险待办、任务与系统提醒。通知按当前工作区/账号隔离，不发送外部邮件。"
      actions={<button onClick={() => void readAll()} disabled={unread === 0} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018] disabled:opacity-40"><CheckCheck className="h-3.5 w-3.5" />全部已读（{unread}）</button>}
    />
    <Panel>
      <div className="flex flex-wrap items-center gap-3 border-b border-white/[0.07] p-4">
        <span className="text-[11px] text-slate-400">分类</span>
        <Select value={category} onChange={setCategory} className="min-w-40" options={[{ value: "", label: "全部分类" }, ...Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }))]} />
        <span className="text-[11px] text-slate-400">状态</span>
        <Select value={archived} onChange={setArchived} className="min-w-36" options={[{ value: "active", label: "未归档" }, { value: "archived", label: "已归档" }, { value: "all", label: "全部" }]} />
        <span className="ml-auto text-[10px] text-slate-400">共 {items.length} 条 · 未读 {unread} 条</span>
      </div>
      {error && <p className="px-4 py-3 text-xs text-rose-200">{error}</p>}
      {loading ? <div className="p-6"><Skeleton rows={5} /></div>
        : items.length === 0 ? <EmptyStateCard icon={Bell} title="暂无通知" description="组织邀请、任务指派与系统提醒会出现在这里。" />
        : <div className="divide-y divide-white/[0.06]">{items.map((item) => <article key={item.id} className={`flex flex-wrap items-start gap-3 px-5 py-4 ${item.read ? "opacity-70" : ""}`}>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-md border px-2 py-0.5 text-[9px] ${SEVERITY_CLASS[item.severity] ?? SEVERITY_CLASS.info}`}>{CATEGORY_LABEL[item.category] ?? item.category}</span>
              {!item.read && <span className="rounded-md bg-rose-400/15 px-2 py-0.5 text-[9px] text-rose-200">未读</span>}
              <span className="text-[9px] text-slate-400">{item.createdAt ? new Date(item.createdAt).toLocaleString("zh-CN") : ""}</span>
            </div>
            <p className="mt-2 text-xs font-medium text-slate-200">{item.title}</p>
            {item.body && <p className="mt-1 text-[11px] leading-5 text-slate-500">{item.body}</p>}
          </div>
          <div className="flex shrink-0 gap-1.5">
            {!item.read && <button type="button" onClick={() => void act(item.id, "read")} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] text-slate-400 hover:text-cyan-200">已读</button>}
            <Tooltip label={item.archived ? "取消归档" : "归档"}><button type="button" onClick={() => void act(item.id, "archive")} className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 text-slate-500 hover:text-cyan-200"><Archive className="h-3.5 w-3.5" /></button></Tooltip>
            <Tooltip label="删除"><button type="button" onClick={() => void act(item.id, "delete")} className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 text-slate-500 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button></Tooltip>
          </div>
        </article>)}</div>}
    </Panel>
  </div>;
}
