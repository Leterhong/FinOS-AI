"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth-store";

/**
 * /onboarding 兼容重定向（Phase 5.8）。
 * 财富初始化向导已迁移至 /onboarding/wealth。
 *  - 已完成财富初始化（profileCompleted）的用户 → 回 Dashboard；
 *  - 未完成 → 进入财富初始化向导。
 */
export default function OnboardingRedirect() {
  const router = useRouter();
  const profileCompleted = useAuthStore((s) => s.currentUser?.profileCompleted);

  useEffect(() => {
    if (profileCompleted) {
      router.replace("/");
    } else {
      router.replace("/onboarding/wealth");
    }
  }, [profileCompleted, router]);

  return null;
}
