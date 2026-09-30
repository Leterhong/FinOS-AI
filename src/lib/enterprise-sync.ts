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

let cachedToken: string | null = null;
let bootstrapPromise: Promise<string | null> | null = null;

/**
 * 用 HttpOnly refresh cookie 静默换取访问令牌（幂等：bootstrap 会复用未过期会话）。
 *
 * 不再信任 sessionStorage 中缓存的旧令牌：它可能属于另一个会话（refresh cookie
 * 指向的用户已变化，例如退出后换号、Cookie 被替换），继续复用会读到错误或空数据。
 * 每次页面加载首次调用都重新换取，之后同一页面内复用内存令牌。
 */
export async function ensureBackendSession(force = false): Promise<string | null> {
  if (!force && cachedToken) return cachedToken;
  if (!force && bootstrapPromise) return bootstrapPromise;
  if (force) cachedToken = null;
  const operation = (async () => {
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
      cachedToken = token;
      return token;
    } catch {
      return null;
    } finally {
      if (bootstrapPromise) bootstrapPromise = null;
    }
  })();
  bootstrapPromise = operation;
  return operation;
}

/**
 * 带后端访问令牌的 fetch：令牌过期/失效（401）时用 refresh cookie 重新换发并重试一次。
 * 访问令牌仅 15 分钟有效，必须处理过期而不是永久复用缓存令牌。
 */
export async function backendAuthedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const send = (token: string) =>
    fetch(`${BASE}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    });
  let token = await ensureBackendSession();
  if (!token) throw new Error("企业服务暂不可用");
  let response = await send(token);
  if (response.status === 401) {
    token = await ensureBackendSession(true);
    if (!token) throw new Error("登录状态已失效，请刷新页面");
    response = await send(token);
  }
  return response;
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
  try {
    const resp = await backendAuthedFetch("/api/enterprise/snapshot");
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
    try {
      await backendAuthedFetch(`/api/enterprise/${kind}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch {
      // 离线：静默。
    }
  })();
}

export function pushDelete(kind: EnterpriseKind, id: string): void {
  void (async () => {
    try {
      await backendAuthedFetch(`/api/enterprise/${kind}/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      // 离线：静默。
    }
  })();
}
