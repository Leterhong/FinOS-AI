"use client";

import { ensureBackendSession } from "@/lib/enterprise-sync";

const BASE = (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/+$/, "");

export async function governanceApi<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await ensureBackendSession();
  if (!token) throw new Error("企业治理服务暂不可用");
  const response = await fetch(`${BASE}/api/governance${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => null) as { success?: boolean; data?: T; error?: string } | null;
  if (!response.ok || !payload?.success) throw new Error(payload?.error || "企业治理请求失败");
  return payload.data as T;
}

export function governancePost<T>(path: string, body: unknown): Promise<T> {
  return governanceApi<T>(path, { method: "POST", body: JSON.stringify(body) });
}
