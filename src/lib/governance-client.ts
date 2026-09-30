"use client";

import { backendAuthedFetch } from "@/lib/enterprise-sync";

export async function governanceApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await backendAuthedFetch(`/api/governance${path}`, init);
  const payload = await response.json().catch(() => null) as { success?: boolean; data?: T; error?: string } | null;
  if (!response.ok || !payload?.success) throw new Error(payload?.error || "企业治理请求失败");
  return payload.data as T;
}

export function governancePost<T>(path: string, body: unknown): Promise<T> {
  return governanceApi<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export function governancePatch<T>(path: string, body: unknown): Promise<T> {
  return governanceApi<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}
