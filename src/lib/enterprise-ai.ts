"use client";

import { ensureWorkspaceSession } from "@/lib/workspace-session";

export interface EnterpriseAIContext {
  cases: unknown[];
  documents: unknown[];
  rules: unknown[];
  risks: unknown[];
}

export interface EnterpriseAIResult {
  answer: string;
  model: string;
  provider: string;
  latencyMs: number;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export async function callEnterpriseAI(input: {
  question: string;
  mode?: "chat" | "agent" | "research";
  context?: EnterpriseAIContext;
}): Promise<EnterpriseAIResult> {
  await ensureWorkspaceSession();
  const response = await fetch("/api/enterprise/ai", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => null) as
    | { result?: EnterpriseAIResult; error?: string; code?: string }
    | null;
  if (!response.ok || !payload?.result) {
    const error = new Error(payload?.error || "AI 调用失败") as Error & { code?: string };
    error.code = payload?.code;
    throw error;
  }
  return payload.result;
}

export async function analyzeEnterpriseDocument(input: {
  file: File;
  project: unknown;
  rules: unknown[];
}): Promise<{ analysis: string; model: string; latencyMs: number }> {
  await ensureWorkspaceSession();
  const form = new FormData();
  form.set("file", input.file);
  form.set("project", JSON.stringify(input.project));
  form.set("rules", JSON.stringify(input.rules));
  const response = await fetch("/api/enterprise/ai/document", {
    method: "POST",
    credentials: "same-origin",
    body: form,
  });
  const payload = await response.json().catch(() => null) as
    | { result?: { analysis: string; model: string; latencyMs: number }; error?: string }
    | null;
  if (!response.ok || !payload?.result) {
    throw new Error(payload?.error || "资料 AI 分析失败");
  }
  return payload.result;
}
