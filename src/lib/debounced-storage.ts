import type { StateStorage } from "zustand/middleware";

/**
 * 带防抖的 localStorage 存储：合并高频写入，降低主线程序列化/写入压力；
 * 页面隐藏或卸载前强制 flush，避免防抖窗口内刷新丢数据。
 */
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Map<string, string>();
let bound = false;

function flush(): void {
  for (const [key, value] of pending) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // 配额或隐私模式失败：忽略，避免影响交互。
    }
  }
  pending.clear();
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
}

function ensureBound(): void {
  if (bound || typeof window === "undefined") return;
  bound = true;
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

export const debouncedStorage: StateStorage = {
  getItem: (name: string): string | null =>
    typeof window === "undefined" ? null : localStorage.getItem(name),
  setItem: (name: string, value: string): void => {
    if (typeof window === "undefined") return;
    ensureBound();
    pending.set(name, value);
    const previous = timers.get(name);
    if (previous) clearTimeout(previous);
    timers.set(name, setTimeout(() => {
      timers.delete(name);
      pending.delete(name);
      try {
        localStorage.setItem(name, value);
      } catch {
        // 忽略写入失败
      }
    }, 300));
  },
  removeItem: (name: string): void => {
    if (typeof window === "undefined") return;
    pending.delete(name);
    const timer = timers.get(name);
    if (timer) clearTimeout(timer);
    timers.delete(name);
    localStorage.removeItem(name);
  },
};
