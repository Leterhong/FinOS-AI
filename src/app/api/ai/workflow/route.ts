import { NextRequest, NextResponse } from "next/server";
import { runWorkflowWithEmitter } from "@/ai/server/workflow-runner";
import { requireFinancialContext, isNeedProfile } from "@/ai/guard";
import type { WorkflowEvent } from "@/ai/types";
import type { WorkflowInput } from "@/ai/services/WorkflowEngine";

// 密钥仅在服务端读取，使用 Node.js 运行时以访问 process.env 与全局 fetch。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface WorkflowBody {
  question?: unknown;
  profile?: unknown;
  activeEvents?: unknown;
  userId?: unknown;
  lifeEventId?: unknown;
}

export async function POST(req: NextRequest) {
  // Phase 5.9：Financial Context Guard —— 必须拥有真实持久化画像
  const ctx = await requireFinancialContext();
  if (isNeedProfile(ctx)) return ctx;

  let body: WorkflowBody;
  try {
    body = (await req.json()) as WorkflowBody;
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const { question, activeEvents } = body ?? {};
  if (typeof question !== "string" || !question.trim()) {
    return NextResponse.json(
      { error: "缺少 question 字段" },
      { status: 400 }
    );
  }

  const input: WorkflowInput = {
    question: question.trim(),
    profile: ctx.profile,
    activeEvents: Array.isArray(activeEvents)
      ? (activeEvents as string[])
      : [],
    userId: ctx.userId,
    lifeEventId: typeof body.lifeEventId === "string" ? body.lifeEventId : undefined,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: WorkflowEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      try {
        const state = await runWorkflowWithEmitter(input, send);
        send({ type: "done", state });
      } catch (err) {
        const message = err instanceof Error ? err.message : "未知工作流错误";
        send({ type: "error", message });
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
