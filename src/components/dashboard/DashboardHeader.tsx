"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "@/store/auth-store";
import { useModelStore } from "@/store/model-store";
import { useFinancialStore } from "@/store/financial-store";
import { Bell, Check, X, ArrowRight } from "lucide-react";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";
import GlobalSearch from "@/components/dashboard/GlobalSearch";

/**
 * Dashboard 顶部全局 Header（Phase 5.7 + Phase 6.8）。
 * 左：动态用户 + AI CFO 实时状态；中/右：主动管家通知铃铛（未读数 + 下拉已读/忽略）；
 * 右：用户入口。
 */
export default function DashboardHeader() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const currentUserId = useFinancialStore((s) => s.currentUserId);
  const profileStatus = useFinancialStore((s) => s.profileStatus);

  const active = useModelStore((s) => s.active);
  const setUserId = useModelStore((s) => s.setUserId);
  const loadActive = useModelStore((s) => s.loadActive);

  // Phase 6.8：主动管家通知
  const notifications = useFinancialStore((s) => s.proactiveNotifications);
  const unread = useFinancialStore((s) => s.proactiveUnread);
  const loadProactiveNotifications = useFinancialStore(
    (s) => s.loadProactiveNotifications
  );
  const loadProactiveSchedule = useFinancialStore((s) => s.loadProactiveSchedule);
  const markAllNotificationsRead = useFinancialStore(
    (s) => s.markAllNotificationsRead
  );
  const markNotification = useFinancialStore((s) => s.markNotification);

  const [bellOpen, setBellOpen] = useState(false);

  useEffect(() => {
    if (currentUserId) {
      setUserId(currentUserId);
      loadActive(currentUserId);
      // Phase 6.8：拉取主动管家通知与调度（供铃铛徽标）
      loadProactiveNotifications();
      loadProactiveSchedule();
    }
  }, [
    currentUserId,
    setUserId,
    loadActive,
    loadProactiveNotifications,
    loadProactiveSchedule,
  ]);

  const displayName =
    currentUser?.name ||
    (currentUser?.email ? currentUser.email.split("@")[0] : "新用户");

  const cfoOnline = Boolean(active);

  const visibleNotifications = notifications
    .filter((n) => !n.dismissed)
    .slice(0, 8);

  return (
    <header className="mb-4 flex shrink-0 items-center justify-between gap-3 xl:mb-5">
      {/* 左：AI CFO 状态 */}
      <div className="flex items-center gap-3 min-w-0">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          {cfoOnline && (
            <motion.span
              className="absolute inline-flex h-full w-full rounded-full bg-semantic-success opacity-60"
              animate={{ scale: [1, 2.2], opacity: [0.6, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
            />
          )}
          <span
            className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
              cfoOnline ? "bg-semantic-success" : "bg-amber-400"
            }`}
          />
        </span>
        <div className="leading-tight min-w-0">
          <p className="truncate text-sm font-medium text-white">
            {displayName}
            <span className="mx-2 text-white/20">/</span>
            <span
              className={cfoOnline ? "text-semantic-success" : "text-amber-400"}
            >
              AI CFO {cfoOnline ? "Online" : "待连接"}
            </span>
          </p>
          <p className="mt-0.5 text-[11px] text-white/40">
            {profileStatus === "empty"
              ? "财富档案待创建"
              : "Your Personal AI CFO"}
          </p>
        </div>
      </div>

      {/* 中：Phase 7.3 全局搜索（记忆 / 知识 / 时间线 / 决策） */}
      <GlobalSearch />

      {/* 右：通知铃铛 + 用户入口 */}
      <div className="flex items-center gap-2">
        {/* 主动管家通知铃铛（Phase 6.8） */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setBellOpen((v) => !v)}
            title="主动管家通知"
            className={cn(
              "relative flex h-9 w-9 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03] transition-colors hover:bg-white/[0.06]",
              bellOpen && "bg-white/[0.06]"
            )}
          >
            <Bell className="h-4 w-4 text-white/70" />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white ring-2 ring-[#0b0f17]">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </button>

          <AnimatePresence>
            {bellOpen && (
              <>
                {/* 点击外部关闭：用不可聚焦的 div 作遮罩，避免焦点落在 aria-hidden 元素上触发无障碍告警 */}
                <div
                  aria-hidden
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setBellOpen(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.18 }}
                  className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-2xl border border-white/10 bg-[#0e1420]/95 p-2 shadow-2xl backdrop-blur-xl"
                >
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <p className="text-xs font-medium text-white">
                      主动管家通知
                      {unread > 0 && (
                        <span className="ml-1.5 text-[10px] text-rose-300">
                          {unread} 未读
                        </span>
                      )}
                    </p>
                    {unread > 0 && (
                      <button
                        type="button"
                        onClick={() => markAllNotificationsRead()}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-emerald-300 transition hover:bg-emerald-400/10"
                      >
                        <Check className="h-3 w-3" /> 全部已读
                      </button>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto">
                    {visibleNotifications.length === 0 ? (
                      <div className="px-3 py-8 text-center">
                        <Bell className="mx-auto h-5 w-5 text-white/20" />
                        <p className="mt-2 text-xs text-white/40">
                          暂无主动提醒
                        </p>
                        <p className="mt-1 text-[10px] text-white/25">
                          运行体检后，AI CFO 会在此推送财富变化与风险提醒
                        </p>
                      </div>
                    ) : (
                      visibleNotifications.map((n) => (
                        <div
                          key={n.id}
                          className={cn(
                            "group flex gap-2 rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.04]",
                            !n.read && "bg-white/[0.03]"
                          )}
                        >
                          <span
                            className={cn(
                              "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                              n.severity === "critical"
                                ? "bg-rose-400"
                                : n.severity === "warn"
                                  ? "bg-amber-400"
                                  : "bg-sky-400"
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <p
                              className={cn(
                                "text-xs leading-snug",
                                n.read ? "text-white/60" : "text-white/90"
                              )}
                            >
                              {n.title}
                            </p>
                            {n.reason && (
                              <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-white/35">
                                {n.reason}
                              </p>
                            )}
                            <div className="mt-1 flex items-center gap-2 text-[10px] text-white/30">
                              <span>{timeAgo(n.createdAt)}</span>
                              {!n.read && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    markNotification(n.id, { read: true })
                                  }
                                  className="text-emerald-300/80 transition hover:text-emerald-300"
                                >
                                  标为已读
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  markNotification(n.id, {
                                    dismissed: true,
                                    read: true,
                                  })
                                }
                                className="inline-flex items-center gap-0.5 text-white/40 transition hover:text-white/70"
                              >
                                <X className="h-2.5 w-2.5" /> 忽略
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="mt-1 grid grid-cols-2 gap-1.5">
                    <Link
                      href="/notifications"
                      onClick={() => setBellOpen(false)}
                      className="flex items-center justify-center gap-1 rounded-xl border border-white/8 bg-white/[0.02] py-2 text-[11px] text-white/60 transition hover:bg-white/[0.06] hover:text-white/90"
                    >
                      通知中心
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                    <Link
                      href="/wealth-monitor"
                      onClick={() => setBellOpen(false)}
                      className="flex items-center justify-center gap-1 rounded-xl border border-white/8 bg-white/[0.02] py-2 text-[11px] text-white/60 transition hover:bg-white/[0.06] hover:text-white/90"
                    >
                      财富监控
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        {/* Phase 7.5 #365：用户头像/姓名已固定在侧栏底部，此处不再重复展示 */}
      </div>
    </header>
  );
}
