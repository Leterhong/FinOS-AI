"use client";

import { useEffect, useState } from "react";
import { MotionConfig } from "framer-motion";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/dashboard/Sidebar";
import DashboardHeader from "@/components/dashboard/DashboardHeader";

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
          </div>
        </main>
      </div>
    </MotionConfig>
  );
}
