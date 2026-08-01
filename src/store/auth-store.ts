"use client";

import { create } from "zustand";
import type { PublicUser } from "@/auth/types";
import { BackendApiError, backendApi, hasBackendToken } from "@/lib/backend-client";

interface AuthState {
  currentUser: PublicUser | null;
  /** 认证状态：initial=未知，loading=校验中，authed=已登录，guest=未登录 */
  status: "initial" | "loading" | "authed" | "guest";
  error: string | null;

  /** 拉取当前会话用户（应用启动/受保护页面挂载时调用）。 */
  loadMe: () => Promise<PublicUser | null>;
  register: (
    email: string,
    password: string,
    name?: string
  ) => Promise<{ ok: boolean; error?: string }>;
  login: (
    email: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  /** 删除当前账户（数据管理「删除账户」）。 */
  deleteAccount: (password: string) => Promise<{ ok: boolean; error?: string }>;
  /** 局部更新当前用户（如头像变更后）。 */
  setUser: (user: PublicUser | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  currentUser: null,
  status: "initial",
  error: null,

  loadMe: async () => {
    // 无 token 直接判定为访客：避免对 /auth/me 发起「必然 401」的请求，
    // 既消除控制台红色报错，也避免无谓的网络往返与重定向。
    if (!hasBackendToken()) {
      set({ currentUser: null, status: "guest" });
      return null;
    }
    set({ status: "loading" });
    try {
      const data = await backendApi.get<{ user: PublicUser }>("/auth/me");
      set({ currentUser: data.user, status: "authed" });
      return data.user;
    } catch {
      // token 失效（401）时清理遗留凭据，避免停留在「死 token」guest 态、
      // 反复被 middleware 弹回登录页却仍能看到过期 token 的混乱。
      backendApi.setToken(null);
      void clearNextSession();
      set({ currentUser: null, status: "guest" });
      return null;
    }
  },

  register: async (email, password) => {
    set({ error: null });
    try {
      const data = await backendApi.post<{ token: string; user: PublicUser }>(
        "/auth/register",
        { email, password },
      );
      backendApi.setToken(data.token);
      // 桥接 Next.js 会话 cookie，使 middleware 登录判定与真实登录态一致
      await establishNextSession(data.token);
      set({ currentUser: data.user, status: "authed", error: null });
      return { ok: true };
    } catch (error) {
      const message = error instanceof BackendApiError ? error.message : "网络错误";
      set({ error: message });
      return { ok: false, error: message };
    }
  },

  login: async (email, password) => {
    set({ error: null });
    try {
      const data = await backendApi.post<{ token: string; user: PublicUser }>(
        "/auth/login",
        { email, password },
      );
      backendApi.setToken(data.token);
      // 桥接 Next.js 会话 cookie，使 middleware 登录判定与真实登录态一致
      await establishNextSession(data.token);
      set({ currentUser: data.user, status: "authed", error: null });
      return { ok: true };
    } catch (error) {
      const message = error instanceof BackendApiError ? error.message : "网络错误";
      set({ error: message });
      return { ok: false, error: message };
    }
  },

  logout: async () => {
    backendApi.setToken(null);
    // 清除 Next.js 会话 cookie：否则 middleware 的 hasSession 判定仍为真，
    // 跳 /login 会被弹回 /，形成「退不回登录页」的死循环。
    await clearNextSession();
    set({ currentUser: null, status: "guest" });
  },

  setUser: (user) => set({ currentUser: user }),

  deleteAccount: async (password) => {
    try {
      await backendApi.delete<{ deleted: boolean }>("/security/account", {
        password,
        confirmation: "DELETE MY DATA",
      });
      backendApi.setToken(null);
      await clearNextSession();
      set({ currentUser: null, status: "guest", error: null });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof BackendApiError ? error.message : "网络错误",
      };
    }
  },
}));

/**
 * 用 FastAPI JWT 反查身份后在 Next.js 侧种下 `finos_session` cookie（UX 路由判定用）。
 * cookie 仅是粗粒度提示，设置失败不影响主登录流程，故吞掉异常。
 */
async function establishNextSession(token: string): Promise<void> {
  try {
    await fetch("/api/auth/session", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      credentials: "same-origin",
    });
  } catch {
    /* best-effort：cookie 缺失只影响 middleware 粗检，真实鉴权走 JWT */
  }
}

/** 清除 Next.js 会话 cookie（登出 / 删账户时调用）。同样 best-effort。 */
export async function clearNextSession(): Promise<void> {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
    });
  } catch {
    /* best-effort */
  }
}
