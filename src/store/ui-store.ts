"use client";

/**
 * UI 状态：侧栏折叠态（仅桌面生效，持久化到 localStorage）。
 */
import { create } from "zustand";

const KEY = "finos-sidebar-collapsed";

function readInitial(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export const useUiStore = create<{
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}>((set) => ({
  sidebarCollapsed: readInitial(),
  toggleSidebar: () =>
    set((state) => {
      const next = !state.sidebarCollapsed;
      try {
        window.localStorage.setItem(KEY, next ? "1" : "0");
      } catch {
        // 无痕模式等场景下 localStorage 不可写：折叠态仅保留在内存。
      }
      return { sidebarCollapsed: next };
    }),
}));
