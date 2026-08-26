import type {
  AgentAnalysisOutput,
  FinancialContextData,
  WorkflowEvent,
} from "./types";
import type { FinancialProfile } from "@/data/types";

/**
 * 浏览器侧 AI 客户端适配器。
 *
 * 关键约束：本文件绝不 import AIService / Provider / WorkflowEngine 等服务端模块，
 * 所有 LLM 调用都通过 fetch 打到 /api/ai/* 服务端路由（密钥仅在服务端持有）。
 * 浏览器只消费流式事件与 JSON 结果，不接触任何密钥或模型实现。
 */

export interface WorkflowRunInput {
  question: string;
  profile: FinancialProfile;
  activeEvents: string[];
  /** Phase 3.5：用户 id。 */
  userId?: string;
  /** Phase 3.5：人生事件 id（人生事件模拟）。 */
  lifeEventId?: string;
}

export interface ChatRunInput {
  messages: { role: "user" | "assistant" | "system"; content: string }[];
  profile: FinancialProfile;
  activeEvents: string[];
  /** Phase 3.5：用户 id。 */
  userId?: string;
  /** Phase 3.5：人生事件 id（人生事件模拟）。 */
  lifeEventId?: string;
}

/** 解析 SSE 文本流，逐条产出 WorkflowEvent。 */
async function* readSSE(
  res: Response
): AsyncGenerator<WorkflowEvent> {
  if (!res.body) throw new Error("AI 响应没有可读的数据流");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          yield JSON.parse(payload) as WorkflowEvent;
        } catch {
          // 忽略无法解析的片段（例如心跳注释）
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function* streamWorkflow(
  path: string,
  body: unknown,
  signal?: AbortSignal
): AsyncGenerator<WorkflowEvent> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    let message = `AI 请求失败（状态码 ${res.status}）`;
    try {
      const data = (await res.json()) as { error?: string };
      if (typeof data?.error === "string") message = data.error;
    } catch {
      // 忽略解析错误
    }
    throw new Error(message);
  }
  yield* readSSE(res);
}

/** 运行 /api/ai/workflow：规划器 → 多智能体 → 总结，流式返回事件。 */
export async function* runWorkflowSSE(
  input: WorkflowRunInput,
  signal?: AbortSignal
): AsyncGenerator<WorkflowEvent> {
  yield* streamWorkflow("/api/ai/workflow", input, signal);
}

/** 运行 /api/ai/chat：以对话消息驱动同一套工作流，流式返回事件。 */
export async function* runChatSSE(
  input: ChatRunInput,
  signal?: AbortSignal
): AsyncGenerator<WorkflowEvent> {
  yield* streamWorkflow("/api/ai/chat", input, signal);
}

/** 调用 /api/ai/agent：执行单个 Agent，返回结构化分析结果（JSON）。 */
export async function callAgent(
  agentId: string,
  context: FinancialContextData
): Promise<AgentAnalysisOutput> {
  const res = await fetch("/api/ai/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId, context }),
  });
  if (!res.ok) {
    let message = `智能体请求失败（状态码 ${res.status}）`;
    try {
      const data = (await res.json()) as { error?: string };
      if (typeof data?.error === "string") message = data.error;
    } catch {
      // 忽略解析错误
    }
    throw new Error(message);
  }
  return (await res.json()) as AgentAnalysisOutput;
}
