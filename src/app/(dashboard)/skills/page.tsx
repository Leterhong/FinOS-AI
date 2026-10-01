"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { AlertTriangle, BookOpenCheck, FileArchive, Loader2, Power, ShieldAlert, Sparkles, Trash2, Upload } from "lucide-react";
import { EmptyStateCard, PageIntro, Panel, PanelHeader } from "@/components/enterprise/EnterpriseUI";
import EnterpriseDialog from "@/components/enterprise/EnterpriseDialog";
import { Skeleton } from "@/components/feedback/Skeleton";
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

interface Candidate {
  name: string;
  summary: string;
  category: string;
  triggers: string[];
  modes: string[];
  playbook: string;
}

interface Risk {
  id: string;
  severity: "high" | "medium";
  label: string;
  evidence: string;
}

const MODE_LABEL: Record<string, string> = { chat: "助手", agent: "Agent", research: "投研" };
const ALL_MODES = ["chat", "agent", "research"] as const;

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [risks, setRisks] = useState<Risk[]>([]);
  const [files, setFiles] = useState<string[]>([]);
  const [sourceFile, setSourceFile] = useState("");
  const [form, setForm] = useState({ name: "", category: "", summary: "", triggers: "" });
  const [modes, setModes] = useState<string[]>(["chat", "agent", "research"]);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const resetUpload = () => {
    setCandidate(null);
    setRisks([]);
    setFiles([]);
    setSourceFile("");
    setForm({ name: "", category: "", summary: "", triggers: "" });
    setModes(["chat", "agent", "research"]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("文件过大（上限 5MB）"); return; }
    setUploading(true);
    resetUpload();
    try {
      const body = new FormData();
      body.set("file", file);
      const resp = await fetch("/api/skills/import", { method: "POST", body });
      const payload = await resp.json() as { candidate?: Candidate; risks?: Risk[]; files?: string[]; sourceFile?: string; error?: string };
      if (!resp.ok || !payload.candidate) throw new Error(payload?.error || "技能文件解析失败");
      const c = payload.candidate;
      setCandidate(c);
      setRisks(payload.risks ?? []);
      setFiles(payload.files ?? []);
      setSourceFile(payload.sourceFile ?? file.name);
      setForm({ name: c.name, category: c.category, summary: c.summary, triggers: c.triggers.join(", ") });
      setModes(c.modes.length ? c.modes : ["chat", "agent", "research"]);
      if ((payload.risks ?? []).length) toast.warning(`检测到 ${payload.risks!.length} 项潜在风险，请确认后再导入`);
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "技能文件解析失败");
    } finally {
      setUploading(false);
    }
  };

  const doImport = async () => {
    if (!candidate) return;
    const name = form.name.trim();
    if (!name) { toast.error("请填写技能名称"); return; }
    setImporting(true);
    try {
      const resp = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          category: form.category.trim(),
          summary: form.summary.trim(),
          triggers: form.triggers.split(/[，,\n]/).map((t) => t.trim()).filter(Boolean),
          modes,
          playbook: candidate.playbook,
        }),
      });
      const payload = await resp.json().catch(() => null) as { error?: string } | null;
      if (!resp.ok) throw new Error(payload?.error || "导入失败");
      toast.success(risks.length ? `已在风险确认后导入技能「${name}」` : `已导入技能「${name}」`);
      setUploadOpen(false);
      resetUpload();
      await load();
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "导入失败");
    } finally {
      setImporting(false);
    }
  };

  const toggle = async (skill: SkillItem) => {
    const nextEnabled = !skill.enabled;
    setBusy(skill.id);
    setSkills((current) => current.map((item) => item.id === skill.id ? { ...item, enabled: nextEnabled } : item));
    try {
      const disabled = skills
        .map((item) => ({ id: item.id, enabled: item.id === skill.id ? nextEnabled : item.enabled }))
        .filter((item) => !item.enabled)
        .map((item) => item.id);
      const resp = await fetch("/api/skills", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ disabled }) });
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

  const enabledCount = skills.filter((item) => item.enabled).length;
  const highRisks = risks.filter((risk) => risk.severity === "high").length;

  return <div className="page-shell">
    <PageIntro
      eyebrow="Domain skills"
      title="专属技能中心"
      description="上传自己的技能（SKILL.md / README.md / .md / .txt / .json 或整包 zip），系统解析并做风险扫描后导入；启用后助手 / Agent / 投研均会按问题匹配或可手动指定。"
      actions={<><span className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-300">已启用 {enabledCount}/{skills.length}</span><button onClick={() => { resetUpload(); setUploadOpen(true); }} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-[#041018]"><Upload className="h-3.5 w-3.5" />上传技能</button></>}
    />
    {error && <p className="rounded-xl border border-rose-400/20 bg-rose-400/[0.05] px-4 py-3 text-xs text-rose-200">{error}</p>}
    {loading ? <Panel><div className="p-6"><Skeleton rows={5} /></div></Panel>
      : skills.length === 0 ? <Panel><EmptyStateCard icon={Sparkles} title="暂无技能" description="点击右上角「上传技能」，上传技能文件或压缩包即可导入。" /></Panel>
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

    <EnterpriseDialog open={uploadOpen} onClose={() => { setUploadOpen(false); resetUpload(); }} title="上传技能" description="支持 SKILL.md / README.md / .md / .txt / .json 单文件，或包含这些文件的 .zip 压缩包（上限 5MB）。导入前会做风险扫描。">
      <div className="space-y-4">
        <input ref={fileRef} type="file" accept=".md,.markdown,.txt,.json,.zip" onChange={(e) => void onPick(e)} className="sr-only" />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-8 text-xs text-slate-400 hover:border-cyan-400/30 hover:text-cyan-200 disabled:opacity-50">
          {uploading ? <Loader2 className="h-6 w-6 animate-spin text-cyan-300" /> : <FileArchive className="h-6 w-6 text-cyan-300" />}
          {uploading ? "正在解析…" : "点击选择技能文件或 zip 压缩包"}
        </button>

        {candidate && <div className="space-y-3">
          <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3 text-[10px] text-slate-500">
            来源文件：<span className="font-mono text-slate-400">{sourceFile}</span>
            {files.length > 1 && <span> · 压缩包内 {files.length} 个文件</span>}
          </div>

          {risks.length > 0 && <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-amber-200"><ShieldAlert className="h-4 w-4" />风险扫描发现 {risks.length} 项风险{highRisks > 0 ? `（高危 ${highRisks} 项）` : ""}</p>
            <ul className="mt-2 space-y-1 text-[11px] leading-5 text-amber-100/80">
              {risks.map((risk) => <li key={risk.id} className="flex gap-2"><AlertTriangle className={`mt-0.5 h-3 w-3 shrink-0 ${risk.severity === "high" ? "text-rose-300" : "text-amber-300"}`} /><span>{risk.label}{risk.evidence ? `（命中：${risk.evidence}）` : ""}</span></li>)}
            </ul>
            <p className="mt-2 text-[10px] text-amber-100/60">确认来源可信后再继续；导入该技能会把它作为系统提示注入模型。</p>
          </div>}

          <label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">技能名称 *</span><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} maxLength={60} className="field-control" /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">分类</span><input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} maxLength={40} className="field-control" /></label>
            <label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">一句话说明</span><input value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} maxLength={200} className="field-control" /></label>
          </div>
          <label className="block"><span className="mb-1.5 block text-[11px] text-slate-400">触发关键词（逗号或换行分隔）</span><textarea value={form.triggers} onChange={(e) => setForm((f) => ({ ...f, triggers: e.target.value }))} rows={2} className="field-control resize-none" /></label>
          <div>
            <span className="mb-1.5 block text-[11px] text-slate-400">适用模式</span>
            <div className="flex gap-2">{ALL_MODES.map((mode) => <button key={mode} type="button" onClick={() => setModes((current) => current.includes(mode) ? current.filter((m) => m !== mode) : [...current, mode])} className={`rounded-xl border px-3 py-2 text-[11px] ${modes.includes(mode) ? "border-cyan-400/25 bg-cyan-400/[0.08] text-cyan-200" : "border-white/[0.08] text-slate-500"}`}>{MODE_LABEL[mode]}</button>)}</div>
          </div>
          <details className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
            <summary className="cursor-pointer text-[11px] text-slate-300">预览方法论（Playbook，导入后作为系统提示）</summary>
            <pre className="scrollbar-thin mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap text-[10px] leading-5 text-slate-400">{candidate.playbook}</pre>
          </details>
        </div>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => { setUploadOpen(false); resetUpload(); }} className="rounded-xl border border-white/10 px-4 py-2.5 text-xs text-slate-400">取消</button>
          <button type="button" onClick={() => void doImport()} disabled={!candidate || importing || uploading} className={`rounded-xl px-4 py-2.5 text-xs font-semibold disabled:opacity-40 ${risks.length ? "bg-amber-300 text-[#180f02]" : "bg-cyan-300 text-[#041018]"}`}>
            {importing ? "导入中…" : risks.length ? "坚持导入（存在风险）" : "导入技能"}
          </button>
        </div>
      </div>
    </EnterpriseDialog>
  </div>;
}
