"use client";

/**
 * 全局命令中心（⌘K / Ctrl+K）。
 *
 * 所有条目都是真实动作：页面跳转、项目/资料/风险的检索定位、
 * 以及「发起研判 / 新建项目 / 上传资料 / 查看高风险 / 配置模型」
 * 等高频操作——没有装饰性入口。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, BriefcaseBusiness, Files, Search, ShieldAlert, Sparkles, Upload, Cpu, Command } from "lucide-react";
import { useEnterpriseStore } from "@/store/enterprise-store";
import { useModelStore } from "@/store/model-store";
import { cn } from "@/lib/utils";

interface Entry {
  href: string;
  label: string;
  hint?: string;
  group: "Suggested" | "Pages" | "Projects" | "Documents" | "Risks";
  icon: React.ComponentType<{ className?: string }>;
}

const OPEN_EVENT = "finos:command-palette";

export function openCommandPalette(): void {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const cases = useEnterpriseStore((state) => state.cases);
  const documents = useEnterpriseStore((state) => state.documents);
  const risks = useEnterpriseStore((state) => state.risks);
  const active = useModelStore((state) => state.active);
  const loadActive = useModelStore((state) => state.loadActive);
  const pending = risks.filter((risk) => risk.status === "待核验");

  useEffect(() => { void loadActive(); }, [loadActive]);

  useEffect(() => {
    const openHandler = () => { setQuery(""); setCursor(0); setOpen(true); };
    const keyHandler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
        setQuery("");
        setCursor(0);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener(OPEN_EVENT, openHandler);
    window.addEventListener("keydown", keyHandler);
    return () => {
      window.removeEventListener(OPEN_EVENT, openHandler);
      window.removeEventListener("keydown", keyHandler);
    };
  }, []);

  const entries = useMemo<Entry[]>(() => {
    const trimmed = query.trim();
    const suggested: Entry[] = [
      { href: "/assistant", label: "Ask FinOS AI", hint: "基于当前工作区上下文研判", group: "Suggested", icon: Bot },
      { href: "/cases", label: "Create Project", hint: "新建企业研判项目", group: "Suggested", icon: BriefcaseBusiness },
      { href: "/documents", label: "Upload Document", hint: "上传资料并触发 AI 分析", group: "Suggested", icon: Upload },
    ];
    if (pending.length > 0) {
      suggested.push({ href: "/risk", label: `View High Risks`, hint: `${pending.length} 项待人工核验`, group: "Suggested", icon: ShieldAlert });
    }
    if (!active?.configured) {
      suggested.push({ href: "/models", label: "Configure Model", hint: "AI 分析需要先接入模型", group: "Suggested", icon: Cpu });
    }
    const pages: Entry[] = [
      { href: "/", label: "经营决策台", group: "Pages", icon: Sparkles },
      { href: "/cases", label: "项目中心", group: "Pages", icon: BriefcaseBusiness },
      { href: "/documents", label: "资料研判", group: "Pages", icon: Files },
      { href: "/risk", label: "风险中心", group: "Pages", icon: ShieldAlert },
      { href: "/rules", label: "规则库", group: "Pages", icon: Sparkles },
      { href: "/research", label: "投研中心", group: "Pages", icon: Files },
      { href: "/agents", label: "Agent 中心", group: "Pages", icon: Bot },
      { href: "/workflows", label: "流程中心", group: "Pages", icon: Files },
      { href: "/governance", label: "企业治理", group: "Pages", icon: ShieldAlert },
      { href: "/models", label: "AI 模型中心", group: "Pages", icon: Cpu },
    ];
    if (!trimmed) return suggested;
    const match = (text: string) => text.toLowerCase().includes(trimmed.toLowerCase());
    return [
      ...suggested.filter((item) => match(item.label)),
      ...pages.filter((item) => match(item.label)),
      ...cases.filter((item) => match(`${item.company}${item.title}`)).slice(0, 4).map((item) => ({ href: "/cases", label: item.company, hint: item.title, group: "Projects" as const, icon: BriefcaseBusiness })),
      ...documents.filter((item) => match(item.name)).slice(0, 4).map((item) => ({ href: "/documents", label: item.name, hint: item.status, group: "Documents" as const, icon: Files })),
      ...risks.filter((item) => match(`${item.title}${item.company}`)).slice(0, 4).map((item) => ({ href: "/risk", label: item.title, hint: item.company, group: "Risks" as const, icon: ShieldAlert })),
    ];
  }, [query, pending.length, active?.configured]);

  useEffect(() => { setCursor(0); }, [query]);

  if (!open) return null;

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/70 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="mx-auto w-full max-w-xl overflow-hidden rounded-xl border border-white/[0.09] bg-elevated shadow-2xl" role="dialog" aria-modal="true" aria-label="全局命令中心">
        <div className="flex items-center gap-2.5 border-b border-white/[0.07] px-4">
          <Search className="h-4 w-4 shrink-0 text-slate-500" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") { event.preventDefault(); setCursor((c) => Math.min(c + 1, entries.length - 1)); }
              if (event.key === "ArrowUp") { event.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
              if (event.key === "Enter" && !event.nativeEvent.isComposing && entries[cursor]) { go(entries[cursor].href); }
            }}
            placeholder="搜索或执行命令：项目、资料、风险、页面…"
            className="h-12 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
          />
          <kbd className="rounded border border-white/10 px-1.5 py-0.5 text-[9px] text-slate-600">ESC</kbd>
        </div>
        <div className="scrollbar-thin max-h-[52vh] overflow-y-auto py-2">
          {entries.length === 0 && <p className="px-4 py-8 text-center text-xs text-slate-600">没有匹配的命令或内容</p>}
          {entries.map((entry, index) => {
            const Icon = entry.icon;
            return (
              <button
                key={`${entry.group}-${entry.href}-${entry.label}-${index}`}
                type="button"
                onMouseEnter={() => setCursor(index)}
                onClick={() => go(entry.href)}
                className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left transition", index === cursor ? "bg-white/[0.055]" : "hover:bg-white/[0.03]")}
              >
                <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/[0.07]", entry.group === "Suggested" ? "bg-wealth/10 text-wealth" : "bg-white/[0.04] text-slate-400")}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-slate-200">{entry.label}</span>
                {entry.hint && <span className="shrink-0 truncate text-[10px] text-slate-600">{entry.hint}</span>}
                {entry.group === "Suggested" && <Command className="h-3 w-3 shrink-0 text-slate-700" />}
              </button>
            );
          })}
        </div>
        <div className="border-t border-white/[0.06] px-4 py-2 text-[10px] text-slate-600">↑↓ 选择 · Enter 跳转 · Esc 关闭</div>
      </div>
    </div>
  );
}
