"use client";

/**
 * userProfileStore（Financial Twin 6.x，需求九）。
 *
 * 管理当前登录用户的「财富画像录入源」（WealthProfile）：
 *  - load：GET /api/profile/wealth（404 = 尚未创建 → empty）；
 *  - loaded 守卫：同一用户已加载则跳过重复拉取（与项目路由预取规范一致）；
 *  - 仅存客户端展示所需数据；敏感数据的加密落盘由服务端 src/security 负责。
 */

import { create } from "zustand";
import type { WealthProfile } from "@/financial-profile/wealth-types";

type LoadStatus = "idle" | "loading" | "loaded" | "empty" | "error";

interface UserProfileState {
  /** 当前已加载数据所属的 userId（用于 loaded 守卫与账户切换检测）。 */
  userId: string | null;
  wealthProfile: WealthProfile | null;
  status: LoadStatus;
  error: string | null;

  /** 拉取当前用户财富画像；同一用户已加载时跳过（force=true 强制刷新）。 */
  load: (userId: string, force?: boolean) => Promise<WealthProfile | null>;
  /** 画像创建/更新成功后本地同步（避免额外一次拉取）。 */
  setWealthProfile: (userId: string, profile: WealthProfile | null) => void;
  /** 清空（退出登录 / 清除财富数据后调用）。 */
  reset: () => void;
}

export const useUserProfileStore = create<UserProfileState>((set, get) => ({
  userId: null,
  wealthProfile: null,
  status: "idle",
  error: null,

  load: async (userId, force = false) => {
    const s = get();
    // loaded 守卫：同一用户且已有结论（loaded/empty）时不重复拉取
    if (
      !force &&
      s.userId === userId &&
      (s.status === "loaded" || s.status === "empty")
    ) {
      return s.wealthProfile;
    }
    set({ userId, status: "loading", error: null });
    try {
      const res = await fetch("/api/profile/wealth", { cache: "no-store" });
      if (res.status === 404) {
        set({ wealthProfile: null, status: "empty" });
        return null;
      }
      if (!res.ok) {
        set({ status: "error", error: `加载失败（${res.status}）` });
        return null;
      }
      const data = (await res.json()) as { wealthProfile?: WealthProfile };
      const wp = data.wealthProfile ?? null;
      set({ wealthProfile: wp, status: wp ? "loaded" : "empty" });
      return wp;
    } catch {
      set({ status: "error", error: "网络错误" });
      return null;
    }
  },

  setWealthProfile: (userId, profile) =>
    set({
      userId,
      wealthProfile: profile,
      status: profile ? "loaded" : "empty",
      error: null,
    }),

  reset: () =>
    set({ userId: null, wealthProfile: null, status: "idle", error: null }),
}));
