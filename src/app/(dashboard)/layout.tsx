"use client";

import { useEffect, useState } from "react";
import { MotionConfig } from "framer-motion";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import DashboardHeader from "@/components/dashboard/DashboardHeader";
import { useEnterpriseStore } from "@/store/enterprise-store";

/** 同步状态徽标：让部署者一眼确认服务端持久化是否生效。 */
function SyncBadge() {
  const serverSync = useEnterpriseStore((state) => state.serverSync);
  if (serverSync === "unknown") return null;
  return (
    <p className={`mt-1 flex items-center gap-1.5 ${serverSync === "synced" ? "text-emerald-300/70" : "text-amber-300/80"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${serverSync === "synced" ? "bg-emerald-400" : "bg-amber-400"}`} />
      {serverSync === "synced" ? "云端已同步：项目与研判数据已持久化到服务端" : "仅本地模式：后端不可达，数据只保存在当前浏览器"}
    </p>
  );
}
import { useModelStore } from "@/store/model-store";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // 服务端持久化：进入工作区后拉取云端快照做跨设备恢复/备份
  //（后端不可达时静默跳过，localStorage 仍是第一真相）。
  useEffect(() => {
    void useEnterpriseStore.getState().syncFromServer();
    void useModelStore.getState().loadActive();
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileNavOpen]);

  return (
    <MotionConfig
      reducedMotion="user"
      transition={{
        ease: [0.22, 1, 0.36, 1],
        duration: 0.2,
      }}
    >
      <div className="relative h-screen overflow-hidden">
        <Sidebar open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />
        {/* Phase 7.5 #359：左边距与 Sidebar 宽度联动（w-60 / xl:w-64），
            并按视口收敛内边距，1366×768 笔记本不再出现横向滚动。 */}
        <main className="flex h-screen min-w-0 flex-col overflow-hidden px-3 py-3 md:px-5 md:py-4 lg:ml-60 xl:ml-64 xl:px-7 xl:py-6 2xl:px-8">
          <div className="mx-auto flex h-full w-full min-w-0 max-w-[1600px] flex-col">
            <DashboardHeader onMenuToggle={() => setMobileNavOpen(true)} />
            <div className="scrollbar-thin flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
              {children}
            </div>
            <footer className="mt-4 shrink-0 border-t border-white/[0.06] pt-3 text-[10px] leading-5 text-slate-600">
              <p>FinOS AI提供信息分析和辅助决策，不构成投资建议，也不替代授信、投资、法律、审计或合规负责人。重大结论请以人工复核为准。</p>
              <SyncBadge />
            </footer>
          </div>
        </main>
      </div>
    </MotionConfig>
  );
}
