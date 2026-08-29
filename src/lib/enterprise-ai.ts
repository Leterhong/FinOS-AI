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

export interface DocumentFact {
  topic: string;
  value: number;
  unit: string;
  quote: string;
  location?: string;
}

export interface DocumentRuleHit {
  code: string;
  name: string;
  hit: boolean;
  reason: string;
  matchedQuote?: string;
}

/**
 * 流式研判：SSE 逐段回调 onDelta，结束后返回最终结果。
 * 协议：data: {"delta": "..."} → data: {"done": true, ...}；出错 data: {"error": "..."}。
 */
export async function streamEnterpriseAI(
  input: {
    question: string;
    mode?: "chat" | "agent" | "research";
    context?: EnterpriseAIContext;
  },
  onDelta: (text: string) => void
): Promise<EnterpriseAIResult> {
  await ensureWorkspaceSession();
  const response = await fetch("/api/enterprise/ai", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, stream: true }),
  });
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null) as { error?: string; code?: string } | null;
    const error = new Error(payload?.error || "AI 调用失败") as Error & { code?: string };
    error.code = payload?.code;
    throw error;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let model = "";
  let latencyMs = 0;
  const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let streamError: string | null = null;

  const handleEvent = (raw: string) => {
    if (!raw.startsWith("data:")) return;
    try {
      const event = JSON.parse(raw.slice(5).trim()) as {
        delta?: string; done?: boolean; model?: string; latencyMs?: number; error?: string;
      };
      if (typeof event.delta === "string" && event.delta) {
        answer += event.delta;
        onDelta(event.delta);
      }
      if (event.done) {
        model = event.model ?? model;
        latencyMs = event.latencyMs ?? latencyMs;
      }
      if (event.error) streamError = event.error;
    } catch {
      // 忽略非 JSON 心跳行
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) handleEvent(line.trim());
  }
  if (buffer) handleEvent(buffer.trim());

  if (streamError) throw new Error(streamError);
  return { answer, model, provider: "user", latencyMs, usage };
}

export async function analyzeEnterpriseDocument(input: {
  file: File;
  project: unknown;
  rules: unknown[];
}): Promise<{
  analysis: string;
  facts: DocumentFact[];
  ruleHits: DocumentRuleHit[];
  uncertainties?: string[];
  model: string;
  latencyMs: number;
}> {
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
    | { result?: { analysis: string; facts?: DocumentFact[]; ruleHits?: DocumentRuleHit[]; uncertainties?: string[]; model: string; latencyMs: number }; error?: string }
    | null;
  if (!response.ok || !payload?.result) {
    throw new Error(payload?.error || "资料 AI 分析失败");
  }
  return {
    analysis: payload.result.analysis,
    facts: payload.result.facts ?? [],
    ruleHits: payload.result.ruleHits ?? [],
    uncertainties: payload.result.uncertainties ?? [],
    model: payload.result.model,
    latencyMs: payload.result.latencyMs,
  };
}
