"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { LayoutDashboard, BriefcaseBusiness, Files, ShieldAlert, ChartNoAxesCombined, Scale, Bot, Workflow, MessageSquareText, X, Cpu, Building2, ShieldCheck, XCircle, CheckCircle2, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Logo from "@/components/brand/Logo";
import { cn } from "@/lib/utils";
import { useEnterpriseStore } from "@/store/enterprise-store";
import { useModelStore } from "@/store/model-store";
import { useUiStore } from "@/store/ui-store";
import { Tooltip } from "@/components/ui/Tooltip";

// Financial Intelligence Navigation：四组导航对齐信息架构，
// 让用户随时知道「工作 / 智能 / 控制 / 管理」四个层面的入口。
const groups = [
  { label: "Workspace", items: [
    { href: "/", label: "经营决策台", icon: LayoutDashboard },
    { href: "/cases", label: "项目中心", icon: BriefcaseBusiness },
    { href: "/documents", label: "资料研判", icon: Files },
  ]},
  { label: "Intelligence", items: [
    { href: "/assistant", label: "智能研判助手", icon: MessageSquareText },
    { href: "/research", label: "投研中心", icon: ChartNoAxesCombined },
    { href: "/agents", label: "Agent 中心", icon: Bot },
  ]},
  { label: "Control", items: [
    { href: "/risk", label: "风险中心", icon: ShieldAlert },
    { href: "/rules", label: "规则库", icon: Scale },
    { href: "/workflows", label: "流程中心", icon: Workflow },
  ]},
  { label: "Administration", items: [
    { href: "/governance", label: "企业治理", icon: ShieldCheck },
    { href: "/models", label: "AI 模型中心", icon: Cpu },
    { href: "/deployment", label: "部署与合规", icon: Building2 },
  ]},
];

export default function Sidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const active = useModelStore((state) => state.active);
  const loadActive = useModelStore((state) => state.loadActive);
  const cases = useEnterpriseStore((state) => state.cases);
  const serverSync = useEnterpriseStore((state) => state.serverSync);
  const { sidebarCollapsed: collapsed, toggleSidebar } = useUiStore();
  const modelReady = Boolean(active?.configured);

  useEffect(() => { void loadActive(); }, [loadActive]);

  return <>
    <button type="button" aria-label="关闭导航" onClick={onClose} className={cn("fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition lg:hidden", open ? "opacity-100" : "pointer-events-none opacity-0")} />
    <aside className={cn(
      "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-white/[0.06] bg-panel shadow-2xl transition-all duration-200",
      "w-[min(17rem,88vw)]",
      collapsed ? "lg:w-[4.25rem]" : "lg:w-64",
      open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
    )}>
      <div className={cn("relative flex h-[68px] shrink-0 items-center border-b border-white/[0.06]", collapsed ? "lg:justify-center lg:px-2" : "px-5")}>
        <Logo size={collapsed ? 32 : 36} showWordmark={!collapsed} />
        <button type="button" aria-label="关闭导航" onClick={onClose} className={cn("ml-auto grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-white/[0.06] lg:hidden", collapsed && "lg:hidden")}><X className="h-4 w-4" /></button>
        {/* 折叠切换（仅桌面） */}
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={collapsed ? "展开侧栏" : "折叠侧栏"}
          className="absolute -right-3 top-[78px] hidden h-6 w-6 place-items-center rounded-full border border-white/10 bg-elevated text-slate-500 transition hover:text-slate-200 lg:grid"
        >
          {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
        </button>
      </div>
      <nav className={cn("scrollbar-thin min-h-0 flex-1 py-4", collapsed ? "lg:px-2" : "px-3")}>
        {groups.map(group => <div key={group.label} className="mb-5">
          <p className={cn("mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[.18em] text-slate-600", collapsed && "lg:hidden")}>{group.label}</p>
          <div className="space-y-0.5">{group.items.map(item => {
            const activeItem = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
            const Icon = item.icon;
            const link = (
              <Link
                prefetch
                key={item.href}
                href={item.href}
                onClick={onClose}
                aria-label={collapsed ? item.label : undefined}
                className={cn(
                  "group/nav relative flex items-center rounded-lg text-[13px] font-medium transition duration-150",
                  collapsed ? "lg:h-9 lg:justify-center lg:px-0" : "gap-3 px-3 py-2",
                  activeItem ? "bg-white/[0.055] text-white" : "text-slate-500 hover:bg-white/[0.035] hover:text-slate-200"
                )}
              >
                {activeItem && <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-wealth" />}
                <Icon className={cn("h-4 w-4 shrink-0", activeItem ? "text-wealth" : "text-slate-500 group-hover/nav:text-slate-300")} />
                <span className={cn("truncate", collapsed && "lg:hidden")}>{item.label}</span>
              </Link>
            );
            return collapsed ? (
              <Tooltip key={item.href} label={item.label} side="right" showOn="lg-hover" className="w-full">
                {link}
              </Tooltip>
            ) : link;
          })}</div>
        </div>)}
      </nav>
      <div className={cn("border-t border-white/[0.06]", collapsed ? "lg:px-2" : "p-3")}>
        {collapsed ? (
          <Tooltip label={modelReady ? `AI 已连接 · ${active?.displayName ?? ""}` : "模型未配置"} side="right" showOn="lg-hover" className="w-full">
            <Link
              href="/models"
              aria-label={modelReady ? "AI 已连接" : "模型未配置"}
              className={cn("flex h-9 items-center justify-center rounded-lg transition", modelReady ? "text-wealth hover:bg-white/[0.05]" : "text-amber-400 hover:bg-white/[0.05]")}
            >
              {modelReady ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            </Link>
          </Tooltip>
        ) : (
          <>
            <Link href="/models" className="block rounded-lg px-2.5 py-2 transition hover:bg-white/[0.04]">
              <div className="flex items-center gap-2 text-[11px] font-medium text-slate-300">
                {modelReady ? <CheckCircle2 className="h-3.5 w-3.5 text-wealth" /> : <XCircle className="h-3.5 w-3.5 text-amber-400" />}
                {modelReady ? "AI 已连接" : "模型未配置"}
              </div>
              <p className="mt-0.5 truncate text-[10px] text-slate-600">
                {modelReady ? `${active?.displayName ?? "模型"} · ${active?.modelName ?? ""}` : "AI 分析需要先接入你自己的模型"}
              </p>
            </Link>
            <div className="mt-1 flex items-center justify-between rounded-lg px-2.5 py-2 text-[10px] text-slate-600">
              <span className="truncate">{cases.length > 0 ? `工作区 · ${cases.length} 个企业项目` : "工作区 · 零预置数据"}</span>
              <span className={cn("shrink-0", serverSync === "synced" && "text-emerald-300/70", serverSync === "local-only" && "text-amber-300/80")}>
                {serverSync === "synced" ? "云端同步" : serverSync === "local-only" ? "仅本地" : ""}
              </span>
            </div>
          </>
        )}
      </div>
    </aside>
  </>;
}
