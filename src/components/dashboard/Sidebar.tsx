"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { LayoutDashboard, BriefcaseBusiness, Files, ShieldAlert, ChartNoAxesCombined, Scale, Bot, Workflow, MessageSquareText, X, ArrowUpRight, Activity, Cpu } from "lucide-react";
import Logo from "@/components/brand/Logo";
import { cn } from "@/lib/utils";

const groups = [
  { label: "研判工作", items: [
    { href: "/", label: "经营决策台", icon: LayoutDashboard },
    { href: "/cases", label: "项目中心", icon: BriefcaseBusiness },
    { href: "/documents", label: "资料研判", icon: Files },
    { href: "/risk", label: "风险中心", icon: ShieldAlert },
  ]},
  { label: "研究与规则", items: [
    { href: "/research", label: "投研中心", icon: ChartNoAxesCombined },
    { href: "/rules", label: "规则库", icon: Scale },
    { href: "/models", label: "AI 模型中心", icon: Cpu },
    { href: "/agents", label: "Agent 中心", icon: Bot },
  ]},
  { label: "协作执行", items: [
    { href: "/workflows", label: "流程中心", icon: Workflow },
    { href: "/assistant", label: "智能研判助手", icon: MessageSquareText },
  ]},
];

export default function Sidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  return <>
    <button type="button" aria-label="关闭导航" onClick={onClose} className={cn("fixed inset-0 z-40 bg-[#02060d]/80 backdrop-blur-sm transition lg:hidden", open ? "opacity-100" : "pointer-events-none opacity-0")} />
    <aside className={cn("fixed inset-y-0 left-0 z-50 flex w-[min(17rem,88vw)] flex-col border-r border-white/[0.07] bg-[#060c14]/98 shadow-2xl transition-transform duration-300 lg:w-64 lg:translate-x-0 lg:bg-[#060c14]/92", open ? "translate-x-0" : "-translate-x-full")}>
      <div className="flex h-[76px] shrink-0 items-center border-b border-white/[0.07] px-5">
        <Logo size={39} showWordmark />
        <button type="button" aria-label="关闭导航" onClick={onClose} className="ml-auto grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-white/[0.06] lg:hidden"><X className="h-4 w-4" /></button>
      </div>
      <div className="mx-4 mt-4 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.055] px-3.5 py-3">
        <div className="flex items-center gap-2 text-xs font-medium text-cyan-100"><Activity className="h-3.5 w-3.5 text-cyan-300" />企业研判空间</div>
        <p className="mt-1.5 truncate text-[11px] text-slate-500">本地安全工作区 · 零预置数据</p>
      </div>
      <nav className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {groups.map(group => <div key={group.label} className="mb-5">
          <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[.18em] text-slate-600">{group.label}</p>
          <div className="space-y-1">{group.items.map(item => {
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
            const Icon = item.icon;
            return <Link prefetch key={item.href} href={item.href} onClick={onClose} className={cn("group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition", active ? "text-white" : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-200")}>
              {active && <motion.span layoutId="enterprise-nav" className="absolute inset-0 rounded-xl border border-cyan-400/15 bg-gradient-to-r from-cyan-400/12 to-blue-400/[0.04]" />}
              <Icon className={cn("relative z-10 h-4 w-4", active && "text-cyan-300")} /><span className="relative z-10">{item.label}</span>
            </Link>;
          })}</div>
        </div>)}
      </nav>
      <div className="border-t border-white/[0.07] p-3">
        <Link href="/assistant" className="flex items-center justify-between rounded-xl border border-cyan-300/15 bg-gradient-to-r from-cyan-400/12 to-blue-500/10 px-3.5 py-3 text-xs font-medium text-cyan-50 hover:border-cyan-300/30">
          <span className="flex items-center gap-2"><Bot className="h-4 w-4 text-cyan-300" />发起一项研判</span><ArrowUpRight className="h-3.5 w-3.5 text-slate-500" />
        </Link>
        <Link href="/models" className="mt-3 flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-white/[0.035]"><div className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-white/[0.05]"><Cpu className="h-3.5 w-3.5 text-cyan-300" /></div><div className="min-w-0"><p className="truncate text-xs text-slate-300">AI 运行基础设施</p><p className="mt-0.5 text-[10px] text-slate-600">配置模型、密钥与连接</p></div></Link>
      </div>
    </aside>
  </>;
}
