"use client";

/**
 * 企业工作区服务端同步层（2.1）。
 *
 * 策略：localStorage 仍是第一真相（乐观更新，离线可用），本模块负责：
 *  - 启动时用 refresh cookie 静默换取访问令牌并拉取服务端快照（跨设备恢复/备份）；
 *  - 每次业务变更后 fire-and-forget 推送（幂等 upsert / 删除）；
 *  - 后端不可达（纯前端开发模式）时全部静默降级，不阻塞任何交互。
 *
 * 不推送的内容：助手对话历史（保留在本地）与上传文件的二进制（服务端另有文档模块）。
 */

const BASE = (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/+$/, "");
const TOKEN_KEY = "finos-be-access-token";

let cachedToken: string | null = null;
let bootstrapPromise: Promise<string | null> | null = null;

function readStoredToken(): string | null {
  if (cachedToken) return cachedToken;
  if (typeof window === "undefined") return null;
  try {
    cachedToken = window.sessionStorage.getItem(TOKEN_KEY);
  } catch {
    cachedToken = null;
  }
  return cachedToken;
}

function storeToken(token: string): void {
  cachedToken = token;
  try {
    window.sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // 无痕模式等场景下 sessionStorage 不可用：仅保留内存令牌。
  }
}

/** 用 HttpOnly refresh cookie 静默换取访问令牌（幂等：bootstrap 会复用未过期会话）。 */
export async function ensureBackendSession(): Promise<string | null> {
  if (readStoredToken()) return cachedToken;
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    try {
      const resp = await fetch(`${BASE}/api/auth/bootstrap`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!resp.ok) return null;
      const payload = (await resp.json()) as { data?: { token?: string } };
      const token = payload?.data?.token;
      if (!token) return null;
      storeToken(token);
      return token;
    } catch {
      return null;
    } finally {
      bootstrapPromise = null;
    }
  })();
  return bootstrapPromise;
}

export interface EnterpriseSnapshot {
  cases: Array<Record<string, unknown>>;
  documents: Array<Record<string, unknown>>;
  risks: Array<Record<string, unknown>>;
  rules: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
  briefs: Array<Record<string, unknown>>;
}

/** 拉取服务端快照；任何失败返回 null（调用方按离线处理）。 */
export async function pullSnapshot(): Promise<EnterpriseSnapshot | null> {
  const token = await ensureBackendSession();
  if (!token) return null;
  try {
    const resp = await fetch(`${BASE}/api/enterprise/snapshot`, {
      credentials: "include",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return null;
    const payload = (await resp.json()) as { data?: EnterpriseSnapshot };
    return payload?.data ?? null;
  } catch {
    return null;
  }
}

export type EnterpriseKind = "cases" | "documents" | "risks" | "rules" | "tasks" | "briefs";

/** 幂等 upsert；fire-and-forget，失败静默（本地已是第一真相）。 */
export function pushEntity(kind: EnterpriseKind, payload: Record<string, unknown>): void {
  void (async () => {
    const token = await ensureBackendSession();
    if (!token) return;
    try {
      await fetch(`${BASE}/api/enterprise/${kind}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
    } catch {
      // 离线：静默。
    }
  })();
}

export function pushDelete(kind: EnterpriseKind, id: string): void {
  void (async () => {
    const token = await ensureBackendSession();
    if (!token) return;
    try {
      await fetch(`${BASE}/api/enterprise/${kind}/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // 离线：静默。
    }
  })();
}
