"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutGrid,
  GitBranch,
  Network,
  MessageSquare,
  FileText,
  BookOpen,
  Sparkles,
  User,
  Database,
  Cpu,
  LogOut,
  Activity,
  TrendingUp,
  Brain,
  FileUp,
  Radar,
  Plug,
  FlaskConical,
  Workflow,
  Bot,
  History,
  Bell,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFinancialStore } from "@/store/financial-store";
import { useAuthStore } from "@/store/auth-store";
import Logo from "@/components/brand/Logo";

/**
 * Phase 7.5 #361：导航按职能分组。
 * 22 个入口平铺会让侧栏变成一堵墙，分组后扫描成本显著下降，
 * 同时组标题在滚动时保持可读，符合 Bloomberg / Linear 的信息密度取向。
 */
const NAV_GROUPS: {
  label: string;
  items: { href: string; label: string; icon: typeof LayoutGrid }[];
}[] = [
  {
    label: "核心",
    items: [
      { href: "/", label: "指挥中心", icon: LayoutGrid },
      { href: "/twin", label: "数字孪生", icon: GitBranch },
      { href: "/timeline", label: "财富时间线", icon: History },
    ],
  },
  {
    label: "财富",
    items: [
      { href: "/data", label: "金融数据中心", icon: Database },
      { href: "/investments", label: "投资中心", icon: TrendingUp },
      { href: "/wealth-monitor", label: "财富监控中心", icon: Radar },
      { href: "/wealth-lab", label: "财富实验室", icon: FlaskConical },
      { href: "/report", label: "财富报告", icon: FileText },
    ],
  },
  {
    label: "智能",
    items: [
      { href: "/assistant", label: "AI 助手", icon: Bot },
      { href: "/chat", label: "AI 财富顾问对话", icon: MessageSquare },
      { href: "/agents", label: "AI 智能体", icon: Network },
      { href: "/automations", label: "智能自动化", icon: Workflow },
      { href: "/memory", label: "AI 记忆中心", icon: Brain },
    ],
  },
  {
    label: "资料",
    items: [
      { href: "/documents", label: "财富资料中心", icon: FileUp },
      { href: "/knowledge", label: "金融知识中心", icon: BookOpen },
      { href: "/onboarding", label: "创建财富分身", icon: Sparkles },
    ],
  },
  {
    label: "系统",
    items: [
      { href: "/notifications", label: "通知中心", icon: Bell },
      { href: "/privacy-center", label: "数据控制中心", icon: Shield },
      { href: "/usage", label: "AI 用量中心", icon: Activity },
      { href: "/settings/profile", label: "个人资料", icon: User },
      { href: "/settings/models", label: "AI 模型中心", icon: Cpu },
      { href: "/settings/data-sources", label: "金融数据源", icon: Plug },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const profileStatus = useFinancialStore((s) => s.profileStatus);

  const currentUser = useAuthStore((s) => s.currentUser);
  const logout = useAuthStore((s) => s.logout);

  const displayName =
    currentUser?.name ||
    (currentUser?.email ? currentUser.email.split("@")[0] : "新用户");
  const avatarUrl = currentUser?.avatarUrl;
  const initial = (displayName || "U").slice(0, 1).toUpperCase();
  const [imgError, setImgError] = useState(false);

  // 滚动条仅在 nav 真正溢出时显示，避免 Chromium 在没溢出时也渲染滚动条轨道
  const navRef = useRef<HTMLElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const check = () => setHasOverflow(el.scrollHeight > el.clientHeight + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    const mo = new MutationObserver(check);
    mo.observe(el, { childList: true, subtree: true });
    window.addEventListener("resize", check);
    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", check);
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    // Phase 7.5 #361：严格三段式 flex column —— 品牌区/底部区 shrink-0 恒定占位，
    // 中间导航 flex-1 + min-h-0 独占剩余空间并滚动。
    // 任何屏幕高度（含 1366×768 笔记本）下底部用户区都不会被菜单顶开或遮挡。
    <aside className="no-print fixed left-0 top-0 z-50 flex h-screen w-60 max-w-[80vw] flex-col overflow-hidden glass border-r border-white/8 xl:w-64">
      {/* ── 品牌区（固定，不参与收缩）── */}
      <div className="flex shrink-0 items-center gap-3 px-5 py-4 xl:py-5">
        <div className="relative">
          <Logo size={36} />
          <motion.div
            className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-semantic-success ring-2 ring-white/10"
            animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold tracking-tight text-white">
            FinOS AI
          </h1>
          <p className="text-[10px] uppercase tracking-widest text-white/40">
            Financial OS
          </p>
        </div>
      </div>

      {/* ── 导航区（唯一可伸缩 + 可滚动区域）── */}
      <nav
        ref={navRef}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2.5 pb-3",
          hasOverflow ? "scrollbar-thin" : "scrollbar-none"
        )}
      >
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-1.5">
            <p className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-[0.16em] text-white/25">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch
                    className={cn(
                      "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-200",
                      isActive
                        ? "text-white"
                        : "text-white/50 hover:bg-white/[0.04] hover:text-white/85"
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="activeNav"
                        className="absolute inset-0 rounded-lg border border-semantic-success/25 bg-semantic-success/10"
                        transition={{
                          type: "spring",
                          stiffness: 320,
                          damping: 32,
                        }}
                      />
                    )}
                    <Icon className="relative z-10 h-4 w-4 shrink-0" />
                    <span className="relative z-10 truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ── 底部区（固定：智能体状态 + 用户 + 退出，永不被遮挡）── */}
      <div className="shrink-0 border-t border-white/8 bg-black/20 px-3 py-2.5">
        {/* 智能体在线状态：并入底部，省一段垂直空间 */}
        <div className="mb-2 flex items-center gap-2 px-1 text-[11px] text-white/40">
          <motion.span
            className="h-1.5 w-1.5 rounded-full bg-semantic-success"
            animate={{ opacity: [1, 0.35, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <span>5 个智能体在线</span>
          <span className="ml-auto text-white/25">
            {profileStatus === "empty" ? "档案待创建" : "运行中"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/settings/profile"
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1 py-1 transition-colors hover:bg-white/[0.05]"
          >
            <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-gradient-brand">
              {avatarUrl?.startsWith("data:") && !imgError ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="h-full w-full object-cover"
                  onError={() => setImgError(true)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-white">
                  {initial}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-white">
                {displayName}
              </p>
              <p className="truncate text-[10px] text-white/35">
                {currentUser?.email ?? "本地账户"}
              </p>
            </div>
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            title="退出登录"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
