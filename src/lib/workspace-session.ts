"use client";

let workspaceSessionInFlight: Promise<void> | null = null;

/** 建立无登录工作区的 HttpOnly 会话；并发调用只发起一次请求。 */
export function ensureWorkspaceSession(): Promise<void> {
  if (workspaceSessionInFlight) return workspaceSessionInFlight;
  const operation = (async () => {
    const response = await fetch("/api/workspace/session", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(payload?.error || "无法建立 AI 工作区会话");
    }
  })();
  workspaceSessionInFlight = operation;
  void operation.catch(() => {
    if (workspaceSessionInFlight === operation) workspaceSessionInFlight = null;
  });
  return operation;
}
