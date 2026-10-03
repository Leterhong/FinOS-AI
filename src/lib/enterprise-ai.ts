"use client";

import { ensureWorkspaceSession } from "@/lib/workspace-session";

/** 统一把网关 HTML 错误（如 nginx 500）、超时/中断映射为可读文案。 */
function friendlyAIError(raw: string | null | undefined, fallback: string): string {
  const text = (raw || "").trim();
  if (!text) return fallback;
  if (/abort|timeout|timed out|ETIMEDOUT|UND_ERR|502|504|nginx|html/i.test(text)) {
    return "AI 服务响应超时或网关错误，请重试，或在模型中心更换响应更快的模型";
  }
  return text;
}

export interface EnterpriseAIContext {
  cases: unknown[];
  documents: unknown[];
  rules: unknown[];
  risks: unknown[];
  /** 外部参考数据（汇率 / 宏观），可选，需人工复核。 */
  external?: unknown;
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
  /** 本次命中的专属技能（供 UI 展示）。 */
  skill?: { id: string; name: string };
}

export async function callEnterpriseAI(input: {
  question: string;
  mode?: "chat" | "agent" | "research";
  context?: EnterpriseAIContext;
  skillId?: string;
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
    const error = new Error(friendlyAIError(payload?.error, "AI 服务无响应或网关错误，请稍后重试")) as Error & { code?: string };
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
  coordinate?: {
    page?: number;
    line?: number;
    bbox?: [number, number, number, number];
    sheet?: string;
    cell?: string;
    row?: number;
    column?: number;
  };
}

export interface DocumentTable {
  name: string;
  headers: string[];
  rows: Array<Record<string, string | number | boolean | null>>;
  sheet?: string;
  range?: string;
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
export interface StreamAIOptions {
  /** 幂等键：自动重试时复用，服务端命中缓存则不重复调用模型。 */
  idempotencyKey?: string;
  /** 重试前回调：让调用方清空已渲染的流式内容，避免重复拼接。 */
  onRestart?: () => void;
}

export async function streamEnterpriseAI(
  input: {
    question: string;
    mode?: "chat" | "agent" | "research";
    context?: EnterpriseAIContext;
    skillId?: string;
    /** 指定子 Agent 角色（资料理解/规则匹配/风险研判/流程辅助），服务端强制其专属提示词。 */
    agent?: "document" | "rules" | "risk" | "workflow";
  },
  onDelta: (text: string) => void,
  signal?: AbortSignal,
  options: StreamAIOptions = {}
): Promise<EnterpriseAIResult> {
  const idempotencyKey = options.idempotencyKey
    ?? (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await streamOnce(input, onDelta, signal, idempotencyKey);
    } catch (error) {
      lastError = error;
      const aborted = Boolean(signal?.aborted) || (error instanceof DOMException && error.name === "AbortError");
      const retryable = error instanceof Error && error.message.includes("未正常结束");
      if (aborted || !retryable || attempt === 1) throw error;
      // 连接在服务端已完成、客户端未收到 done 时，用同一幂等键重试会命中缓存直接回放。
      options.onRestart?.();
    }
  }
  throw lastError;
}

async function streamOnce(
  input: {
    question: string;
    mode?: "chat" | "agent" | "research";
    context?: EnterpriseAIContext;
    skillId?: string;
    /** 指定子 Agent 角色（资料理解/规则匹配/风险研判/流程辅助），服务端强制其专属提示词。 */
    agent?: "document" | "rules" | "risk" | "workflow";
  },
  onDelta: (text: string) => void,
  signal: AbortSignal | undefined,
  idempotencyKey: string
): Promise<EnterpriseAIResult> {
  await ensureWorkspaceSession();
  const response = await fetch("/api/enterprise/ai", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, stream: true, idempotencyKey }),
    signal,
  });
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => null) as { error?: string; code?: string } | null;
    const error = new Error(friendlyAIError(payload?.error, "AI 服务无响应或网关错误，请稍后重试")) as Error & { code?: string };
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
  let sawDone = false;
  let skill: { id: string; name: string } | undefined;

  const handleEvent = (raw: string) => {
    if (!raw.startsWith("data:")) return;
    try {
      const event = JSON.parse(raw.slice(5).trim()) as {
        delta?: string; done?: boolean; model?: string; latencyMs?: number; error?: string; skill?: { id: string; name: string };
      };
      if (typeof event.delta === "string" && event.delta) {
        answer += event.delta;
        onDelta(event.delta);
      }
      if (event.done) {
        sawDone = true;
        model = event.model ?? model;
        latencyMs = event.latencyMs ?? latencyMs;
        skill = event.skill ?? skill;
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

  if (signal?.aborted) throw new DOMException("请求已取消", "AbortError");
  if (streamError) throw new Error(friendlyAIError(streamError, "模型返回错误"));
  // 连接中途断开时不会有 done 事件：避免把半截输出当成完整回答落库。
  if (!sawDone) throw new Error("模型响应未正常结束（连接可能中断），请重试");
  if (!answer.trim()) throw new Error("模型返回了空回复，请检查模型网关的流式响应兼容性");
  return { answer, model, provider: "user", latencyMs, usage, skill };
}

export type DocumentStage = "parse" | "facts" | "rules" | "narrative";

export async function analyzeEnterpriseDocument(input: {
  file: File;
  project: unknown;
  rules: unknown[];
  /** 提供时走流式模式，按真实管线阶段回调（parse/facts/rules/narrative）。 */
  onStage?: (stage: DocumentStage, state: "active" | "done") => void;
}): Promise<{
  analysis: string;
  facts: DocumentFact[];
  ruleHits: DocumentRuleHit[];
  uncertainties?: string[];
  extractionFailed?: boolean;
  guardFlags?: string[];
  extractionMethod?: "text" | "ocr" | "table";
  ocrUsed?: boolean;
  tables?: DocumentTable[];
  model: string;
  latencyMs: number;
}> {
  await ensureWorkspaceSession();
  const form = new FormData();
  form.set("file", input.file);
  form.set("project", JSON.stringify(input.project));
  form.set("rules", JSON.stringify(input.rules));
  const streaming = Boolean(input.onStage);
  const response = await fetch(`/api/enterprise/ai/document${streaming ? "?stream=1" : ""}`, {
    method: "POST",
    credentials: "same-origin",
    body: form,
  });
  if (streaming) {
    if (!response.ok || !response.body) {
      const errorPayload = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(friendlyAIError(errorPayload?.error, "资料 AI 服务无响应或网关错误，请稍后重试"));
    }
    return await consumeStageStream(response.body!, input.onStage!);
  }
  const payload = await response.json().catch(() => null) as
    | { result?: { analysis: string; facts?: DocumentFact[]; ruleHits?: DocumentRuleHit[]; uncertainties?: string[]; extractionFailed?: boolean; guardFlags?: string[]; extractionMethod?: "text" | "ocr" | "table"; ocrUsed?: boolean; tables?: DocumentTable[]; model: string; latencyMs: number }; error?: string }
    | null;
  if (!response.ok || !payload?.result) {
    throw new Error(friendlyAIError(payload?.error, "资料 AI 服务无响应或网关错误，请稍后重试"));
  }
  return {
    analysis: payload.result.analysis,
    facts: payload.result.facts ?? [],
    ruleHits: payload.result.ruleHits ?? [],
    uncertainties: payload.result.uncertainties ?? [],
    extractionFailed: payload.result.extractionFailed,
    guardFlags: payload.result.guardFlags,
    extractionMethod: payload.result.extractionMethod,
    ocrUsed: payload.result.ocrUsed,
    tables: payload.result.tables ?? [],
    model: payload.result.model,
    latencyMs: payload.result.latencyMs,
  };
}

/** 解析分阶段 SSE：{stage,state} 进度事件 + 最终 {result} 或 {error}。 */
async function consumeStageStream(
  body: ReadableStream<Uint8Array>,
  onStage: (stage: DocumentStage, state: "active" | "done") => void
): Promise<{
  analysis: string;
  facts: DocumentFact[];
  ruleHits: DocumentRuleHit[];
  uncertainties?: string[];
  extractionFailed?: boolean;
  guardFlags?: string[];
  extractionMethod?: "text" | "ocr" | "table";
  ocrUsed?: boolean;
  tables?: DocumentTable[];
  model: string;
  latencyMs: number;
}> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let failure: string | null = null;
  let final: {
    analysis: string;
    facts: DocumentFact[];
    ruleHits: DocumentRuleHit[];
    uncertainties?: string[];
    extractionFailed?: boolean;
    guardFlags?: string[];
    extractionMethod?: "text" | "ocr" | "table";
    ocrUsed?: boolean;
    tables?: DocumentTable[];
    model: string;
    latencyMs: number;
  } | null = null;

  const handleEvent = (raw: string) => {
    if (!raw.startsWith("data:")) return;
    try {
      const event = JSON.parse(raw.slice(5).trim()) as {
        stage?: DocumentStage;
        state?: "active" | "done";
        result?: { analysis: string; facts?: DocumentFact[]; ruleHits?: DocumentRuleHit[]; uncertainties?: string[]; extractionFailed?: boolean; guardFlags?: string[]; extractionMethod?: "text" | "ocr" | "table"; ocrUsed?: boolean; tables?: DocumentTable[]; model: string; latencyMs: number };
        error?: string;
      };
      if (event.stage && event.state) onStage(event.stage, event.state);
      if (event.result) {
        final = {
          ...event.result,
          facts: event.result.facts ?? [],
          ruleHits: event.result.ruleHits ?? [],
        };
      }
      if (event.error) failure = event.error;
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
  if (failure) throw new Error(friendlyAIError(failure, "资料 AI 分析未返回结果"));
  if (!final) throw new Error("资料 AI 分析未返回结果");
  return final;
}
