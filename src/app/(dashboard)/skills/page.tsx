"use client";

import { type FormEvent, useEffect, useState } from "react";
import { BookOpenCheck, Loader2, Plus, Power, Sparkles, Trash2 } from "lucide-react";
import { EmptyStateCard, PageIntro, Panel, PanelHeader } from "@/components/enterprise/EnterpriseUI";
import EnterpriseDialog from "@/components/enterprise/EnterpriseDialog";
import { toast } from "@/components/feedback/toast";
import { ensureWorkspaceSession } from "@/lib/workspace-session";

interface SkillItem {
  id: string;
  name: string;
  summary: string;
  category: string;
  source: string;
  version: string;
  triggers: string[];
  modes: string[];
  playbook: string;
  enabled: boolean;
  custom: boolean;
}

const MODE_LABEL: Record<string, string> = { chat: "助手", agent: "Agent", research: "投研" };
const ALL_MODES = ["chat", "agent", "research"] as const;

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [modes, setModes] = useState<string[]>(["chat", "agent", "research"]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      await ensureWorkspaceSession();
      const resp = await fetch("/api/skills", { cache: "no-store" });
      const payload = await resp.json() as { skills?: SkillItem[]; error?: string };
      if (!resp.ok) throw new Error(payload?.error || "加载技能失败");
      setSkills(payload.skills ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "加载技能失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const toggle = async (skill: SkillItem) => {
    const nextEnabled = !skill.enabled;
    setBusy(skill.id);
    setSkills((current) => current.map((item) => item.id === skill.id ? { ...item, enabled: nextEnabled } : item));
    try {
      const disabled = skills
        .map((item) => ({ id: item.id, enabled: item.id === skill.id ? nextEnabled : item.enabled }))
        .filter((item) => !item.enabled)
        .map((item) => item.id);
      const resp = await fetch("/api/skills", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled }),
      });
      const payload = await resp.json().catch(() => null) as { error?: string } | null;
      if (!resp.ok) throw new Error(payload?.error || "保存失败");
      toast.success(nextEnabled ? `已启用技能「${skill.name}」` : `已停用技能「${skill.name}」`);
    } catch (reason) {
      setSkills((current) => current.map((item) => item.id === skill.id ? { ...item, enabled: skill.enabled } : item));
      toast.error(reason instanceof Error ? reason.message : "保存失败");
    } finally {
      setBusy("");
    }
  };

  const remove = async (skill: SkillItem) => {
    if (!window.confirm(`确定删除自定义技能「${skill.name}」？删除后不可恢复。`)) return;
    setBusy(`del-${skill.id}`);
    try {
      const resp = await fetch(`/api/skills?id=${encodeURIComponent(skill.id)}`, { method: "DELETE" });
      const payload = await resp.json().catch(() => null) as { error?: string } | null;
      if (!resp.ok) throw new Error(payload?.error || "删除失败");
      setSkills((current) => current.filter((item) => item.id !== skill.id));
      toast.success(`已删除技能「${skill.name}」`);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "删除失败");
    } finally {
      setBusy("");
    }
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const playbook = String(form.get("playbook") || "").trim();
    if (!name || !playbook) {
      toast.error("请填写技能名称与方法论");
      return;
    }
    const triggers = String(form.get("triggers") || "").split(/[，,\n]/).map((t) => t.trim()).filter(Boolean);
    setCreating(true);
    try {
      const resp = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          category: String(form.get("category") || "").trim(),
          summary: String(form.get("summary") || "").trim(),
          triggers,
          modes,
          playbook,
        }),
      });
      const payload = await resp.json().catch(() => null) as { error?: string } | null;
      if (!resp.ok) throw new Error(payload?.error || "创建失败");
      toast.success(`已添加技能「${name}」`);
      setCreateOpen(false);
      setModes(["chat", "agent", "research"]);
      await load();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "创建失败");
    } finally {
      setCreating(false);
    }
  };

  const enabledCount = skills.filter((item) => item.enabled).length;

  return <div className="page-shell">
    <PageIntro
      eyebrow="Domain skills"
      title="专属技能中心"
      description="统一管理内置与自定义技能。启用后，助手 / Agent / 投研会按问题与模式自动选择；也可在对话输入框直接指定技能。"
      actions={<><span className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-300">已启用 {enabledCount}/{skills.length}</span><button onClick={() => setCreateOpen(true)} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]"><Plus className="h-3.5 w-3.5" />新增技能</button></>}
    />
    {error && <p className="rounded-xl border border-rose-400/20 bg-rose-400/[0.05] px-4 py-3 text-xs text-rose-200">{error}</p>}
    {loading ? <Panel><div className="flex items-center gap-2 p-6 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin text-cyan-300" />正在加载技能…</div></Panel>
      : skills.length === 0 ? <Panel><EmptyStateCard icon={Sparkles} title="暂无技能" description="可点击右上角「新增技能」添加自己的领域方法。" /></Panel>
      : <div className="grid gap-4 xl:grid-cols-2">
        {skills.map((skill) => <Panel key={skill.id}>
          <PanelHeader
            eyebrow={`${skill.category} · v${skill.version} · ${skill.custom ? "自定义" : "内置"}`}
            title={skill.name}
            description={skill.summary}
            action={<div className="flex shrink-0 items-center gap-2">
              {skill.custom && <button type="button" onClick={() => void remove(skill)} disabled={busy === `del-${skill.id}`} title="删除自定义技能" className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-slate-500 hover:border-rose-400/30 hover:text-rose-300 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button>}
              <button type="button" onClick={() => void toggle(skill)} disabled={busy === skill.id} className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] disabled:opacity-40 ${skill.enabled ? "border-emerald-400/25 text-emerald-200" : "border-white/10 text-slate-400"}`}><Power className="h-3.5 w-3.5" />{busy === skill.id ? "保存中…" : skill.enabled ? "已启用" : "已停用"}</button>
            </div>}
          />
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap gap-1.5">
              {skill.modes.map((mode) => <span key={mode} className="rounded-md border border-cyan-400/20 bg-cyan-400/[0.05] px-2 py-0.5 text-[9px] text-cyan-200">{MODE_LABEL[mode] ?? mode}</span>)}
              <span className="rounded-md border border-white/10 px-2 py-0.5 text-[9px] text-slate-500">来源：{skill.source}</span>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.15em] text-slate-600">触发关键词</p>
              <p className="mt-1.5 text-[10px] leading-5 text-slate-500">{skill.triggers.length ? skill.triggers.slice(0, 30).join(" · ") : "未设置（仅可按指定方式使用）"}</p>
            </div>
            <details className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
              <summary className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-300"><BookOpenCheck className="h-3.5 w-3.5 text-cyan-300" />查看技能方法论（Playbook）</summary>
              <pre className="scrollbar-thin mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap text-[10px] leading-5 text-slate-400">{skill.playbook}</pre>
            </details>
          </div>
        </Panel>)}
      </div>}

    <EnterpriseDialog open={createOpen} onClose={() => setCreateOpen(false)} title="新增自定义技能" description="把你自己的方法沉淀为技能：填写触发关键词与方法论，启用后即可在助手/Agent/投研中自动匹配或手动指定。">
      <form onSubmit={create} className="space-y-4">
        <label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">技能名称 *</span><input required name="name" maxLength={60} placeholder="如：供应商合规审查" className="field-control" /></label>
        <label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">分类</span><input name="category" maxLength={40} placeholder="如：审计与合规" className="field-control" /></label>
        <label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">一句话说明</span><input name="summary" maxLength={200} placeholder="这个技能解决什么问题" className="field-control" /></label>
        <label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">触发关键词（逗号或换行分隔）</span><textarea name="triggers" rows={2} placeholder="合规, 供应商, 资质, 一致性" className="field-control resize-none" /></label>
        <div>
          <span className="mb-1.5 block text-[11px] text-slate-400">适用模式</span>
          <div className="flex gap-2">{ALL_MODES.map((mode) => <button key={mode} type="button" onClick={() => setModes((current) => current.includes(mode) ? current.filter((m) => m !== mode) : [...current, mode])} className={`rounded-xl border px-3 py-2 text-[11px] ${modes.includes(mode) ? "border-cyan-400/25 bg-cyan-400/[0.08] text-cyan-200" : "border-white/[0.08] text-slate-500"}`}>{MODE_LABEL[mode]}</button>)}</div>
        </div>
        <label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">方法论 / Playbook *（将作为系统提示注入）</span><textarea required name="playbook" rows={8} maxLength={8000} placeholder={"【本次技能：xxx】\n按以下结构输出：\n一、检查清单…\n二、判定口径…\n三、输出结构…\n四、护栏…"} className="field-control resize-none" /></label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setCreateOpen(false)} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-400">取消</button>
          <button type="submit" disabled={creating} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018] disabled:opacity-40">{creating ? "保存中…" : "添加技能"}</button>
        </div>
      </form>
    </EnterpriseDialog>
  </div>;
}
