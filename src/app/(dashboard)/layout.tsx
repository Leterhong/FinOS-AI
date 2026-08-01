"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, MotionConfig } from "framer-motion";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import { useAuthStore, clearNextSession } from "@/store/auth-store";
import { useFinancialStore } from "@/store/financial-store";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const currentUser = useAuthStore((s) => s.currentUser);
  const loadMe = useAuthStore((s) => s.loadMe);
  const setCurrentUserId = useFinancialStore((s) => s.setCurrentUserId);

  // Phase 5.6：应用启动 / 受保护页面挂载时拉取当前会话用户
  useEffect(() => {
    loadMe();
  }, [loadMe]);

  // Phase 5.6：会话用户就绪后，将当前登录用户 id 写入 financial-store（隔离绑定）
  // 提升到 layout，使所有 dashboard 子页面共享，无需各页重复驱动。
  useEffect(() => {
    if (currentUser?.id) {
      setCurrentUserId(currentUser.id);
    }
  }, [currentUser?.id, setCurrentUserId]);

  // Phase 5.6：访客兜底重定向（middleware 仅做 cookie 粗检，此处用真实会话状态拦截）
  useEffect(() => {
    if (status === "guest") {
      // 进入访客态即清除 Next.js 会话 cookie，避免「cookie 残留 + 无 token」
      // 在 /login 与受保护页之间反复弹回，导致退不回登录页的死循环。
      void clearNextSession();
      router.replace("/login");
    }
  }, [status, router]);

  return (
    <MotionConfig
      reducedMotion="user"
      transition={{
        ease: [0.22, 1, 0.36, 1],
        duration: 0.4,
      }}
    >
      <div className="relative h-screen overflow-hidden">
        <Sidebar />
        {/* Phase 7.5 #359：左边距与 Sidebar 宽度联动（w-60 / xl:w-64），
            并按视口收敛内边距，1366×768 笔记本不再出现横向滚动。 */}
        <main className="ml-60 flex h-screen min-w-0 flex-col overflow-hidden px-4 py-4 xl:ml-64 xl:px-7 xl:py-6 2xl:px-8">
          <div className="mx-auto flex h-full w-full min-w-0 max-w-[1600px] flex-col">
            <DashboardHeader />
            <AnimatePresence mode="wait" initial={false}>
              {/*
                Phase 7.9：滚动归属此层。
                父级均 h-screen + overflow-hidden，content 超出视口时由本层
                overflow-y-auto 提供滚动条，DashboardHeader（shrink-0）保持顶部钉死。
                所有 dashboard 子页面统一受益，无需各页自裹滚动容器。
              */}
              <div
                key={pathname}
                className="scrollbar-thin flex-1 min-h-0 flex flex-col overflow-y-auto pr-1"
              >
                {children}
              </div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </MotionConfig>
  );
}
