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

let sessionBootstrapInFlight: Promise<PublicUser | null> | null = null;

export const useAuthStore = create<AuthState>((set) => ({
  currentUser: null,
  status: "initial",
  error: null,

  loadMe: () => {
    if (sessionBootstrapInFlight) return sessionBootstrapInFlight;
    set({ status: "loading" });
    const operation = (async (): Promise<PublicUser | null> => {
      try {
      // bootstrap 在首次访问时创建隔离访客空间，已有 refresh cookie 时恢复原会话。
      // 与先请求 /refresh 不同，它不会用一个“预期中的 401”污染浏览器控制台。
      let user: PublicUser;
      let token: string | null = null;
      if (hasBackendToken()) {
        const session = await backendApi.get<{ user: PublicUser }>("/auth/me");
        user = session.user;
      } else {
        const session = await backendApi.bootstrapSession<{
          token: string;
          user: PublicUser;
          guest: boolean;
        }>();
        token = session.token;
        user = session.user;
        backendApi.setToken(token);
      }
      if (token) {
        const bridged = await establishNextSession(token);
        if (!bridged) throw new Error("无法建立本地会话");
      }
      set({ currentUser: user, status: "authed", error: null });
        return user;
      } catch {
        backendApi.setToken(null);
        set({ currentUser: null, status: "guest" });
        return null;
      }
    })();
    sessionBootstrapInFlight = operation;
    void operation.finally(() => {
      if (sessionBootstrapInFlight === operation) sessionBootstrapInFlight = null;
    });
    return operation;
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
    try {
      await backendApi.post("/auth/logout", {});
    } catch {
      /* 本地退出仍继续，服务端 Cookie 会自然过期。 */
    }
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
async function establishNextSession(token: string | null): Promise<boolean> {
  if (!token) return false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        credentials: "same-origin",
      });
      if (response.ok) return true;
    } catch {
      /* 短暂服务抖动由下一次循环重试。 */
    }
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
  return false;
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
