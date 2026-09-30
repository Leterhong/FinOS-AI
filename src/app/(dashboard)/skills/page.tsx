"use client";

import { useEffect, useState } from "react";
import { BookOpenCheck, Loader2, Power, Sparkles } from "lucide-react";
import { EmptyStateCard, PageIntro, Panel, PanelHeader } from "@/components/enterprise/EnterpriseUI";
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
}

const MODE_LABEL: Record<string, string> = { chat: "助手", agent: "Agent", research: "投研" };

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

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
    // 乐观更新
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

  const enabledCount = skills.filter((item) => item.enabled).length;

  return <div className="page-shell">
    <PageIntro
      eyebrow="Domain skills"
      title="专属技能中心"
      description="统一管理助手 / Agent / 投研使用的领域技能。启用后，网关会按问题与模式自动选择最合适的技能，统一输出结构与判定口径。"
      actions={<span className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-300">已启用 {enabledCount}/{skills.length}</span>}
    />
    {error && <p className="rounded-xl border border-rose-400/20 bg-rose-400/[0.05] px-4 py-3 text-xs text-rose-200">{error}</p>}
    {loading ? <Panel><div className="flex items-center gap-2 p-6 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin text-cyan-300" />正在加载技能…</div></Panel>
      : skills.length === 0 ? <Panel><EmptyStateCard icon={Sparkles} title="暂无已注册技能" description="技能模块位于 src/ai/skills，注册后会自动出现在这里。" /></Panel>
      : <div className="grid gap-4 xl:grid-cols-2">
        {skills.map((skill) => <Panel key={skill.id}>
          <PanelHeader
            eyebrow={`${skill.category} · v${skill.version}`}
            title={skill.name}
            description={skill.summary}
            action={<button type="button" onClick={() => void toggle(skill)} disabled={busy === skill.id} className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] disabled:opacity-40 ${skill.enabled ? "border-emerald-400/25 text-emerald-200" : "border-white/10 text-slate-400"}`}><Power className="h-3.5 w-3.5" />{busy === skill.id ? "保存中…" : skill.enabled ? "已启用" : "已停用"}</button>}
          />
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap gap-1.5">
              {skill.modes.map((mode) => <span key={mode} className="rounded-md border border-cyan-400/20 bg-cyan-400/[0.05] px-2 py-0.5 text-[9px] text-cyan-200">{MODE_LABEL[mode] ?? mode}</span>)}
              <span className="rounded-md border border-white/10 px-2 py-0.5 text-[9px] text-slate-500">来源：{skill.source}</span>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[.15em] text-slate-600">触发关键词</p>
              <p className="mt-1.5 text-[10px] leading-5 text-slate-500">{skill.triggers.slice(0, 24).join(" · ")}</p>
            </div>
            <details className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
              <summary className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-300"><BookOpenCheck className="h-3.5 w-3.5 text-cyan-300" />查看技能方法论（Playbook）</summary>
              <pre className="scrollbar-thin mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap text-[10px] leading-5 text-slate-400">{skill.playbook}</pre>
            </details>
          </div>
        </Panel>)}
      </div>}
  </div>;
}
