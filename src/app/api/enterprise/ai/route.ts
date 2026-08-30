import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/auth/session";
import { resolveActiveModel } from "@/ai/model-center/models/resolver";
import { ModelStoreDecryptError } from "@/ai/model-center/models/store";
import { OpenAICompatibleProvider } from "@/ai/model-center/providers/OpenAICompatibleProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_QUESTION_CHARS = 12_000;
const MAX_CONTEXT_CHARS = 48_000;

type Mode = "chat" | "agent" | "research";

interface RequestBody {
  question?: unknown;
  mode?: unknown;
  context?: unknown;
  stream?: unknown;
}

const BASE_SYSTEM_PROMPT = `你是 FinOS AI 的企业经营与风险研判助手。你的任务是辅助资料理解、规则匹配、风险提示、投研整理和流程规划。

必须遵守：
1. 只使用用户问题和“工作区上下文”中明确提供的信息，不得虚构企业、金额、证据、规则、来源或结论。
2. 清晰区分“已知事实”“分析推断”“待补材料”和“建议动作”。上下文为空时直接说明无法开展基于事实的企业研判。
3. 任何风险判断都要说明依据与不确定性；没有证据时不得给出确定性风险结论。
4. 不执行审批、授信、投资、付款或对外发送等操作，不声称已完成任何未实际执行的工具调用。
5. 输出为简体中文，专业、结构清晰、可供业务人员复核。
6. 你的输出仅用于信息分析和辅助决策，不构成投资、授信、法律、审计或合规意见。`;

const MODE_PROMPTS: Record<Mode, string> = {
  chat: "直接回答用户问题；必要时列出事实依据、缺失信息和下一步核验建议。",
  agent: "执行一次企业风险研判：依次给出任务理解、可用资料、规则匹配、风险观察、数据缺口和人工复核清单。",
  research: "生成研究底稿：给出研究框架、基于现有上下文的观察、需要补充的外部来源以及对企业经营或风险的可能传导路径。不得伪造外部数据。",
};

function normalizeMode(value: unknown): Mode {
  return value === "agent" || value === "research" ? value : "chat";
}

function serializeContext(value: unknown): string {
  if (!value || typeof value !== "object") return "（工作区暂无数据）";
  try {
    return JSON.stringify(value, null, 2).slice(0, MAX_CONTEXT_CHARS);
  } catch {
    return "（工作区上下文无法序列化）";
  }
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "工作区会话未建立" }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = await req.json() as RequestBody;
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "请输入研判问题" }, { status: 400 });
  }
  if (question.length > MAX_QUESTION_CHARS) {
    return NextResponse.json({ error: `问题不能超过 ${MAX_QUESTION_CHARS} 个字符` }, { status: 413 });
  }

  let model;
  try {
    model = await resolveActiveModel(userId);
  } catch (error) {
    if (error instanceof ModelStoreDecryptError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }
  if (!model) {
    return NextResponse.json(
      { error: "尚未配置可用的大模型，请先前往 AI 模型中心完成配置。", code: "NO_MODEL" },
      { status: 409 },
    );
  }

  const mode = normalizeMode(body.mode);
  const context = serializeContext(body.context);
  const provider = new OpenAICompatibleProvider(model);

  // ── 流式模式：SSE 逐段转发（前端助手逐字渲染，等待感大幅下降）──
  if (body.stream === true) {
    const encoder = new TextEncoder();
    const started = Date.now();
    const sse = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (payload: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };
        try {
          for await (const chunk of provider.stream({
            messages: [
              { role: "system", content: `${BASE_SYSTEM_PROMPT}

当前任务模式：${MODE_PROMPTS[mode]}` },
              { role: "user", content: `【工作区上下文】
${context}

【用户任务】
${question}` },
            ],
            model: model.modelId,
            temperature: model.temperature ?? 0.3,
            maxTokens: Math.min(model.maxTokens ?? 2048, 8192),
          })) {
            if (chunk.content) send({ delta: chunk.content });
          }
          send({ done: true, model: model.modelId, latencyMs: Date.now() - started });
        } catch (error) {
          send({ error: error instanceof Error ? error.message : "模型流式调用失败" });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(sse, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      },
    });
  }

  try {
    const response = await provider.generate({
      messages: [
        { role: "system", content: `${BASE_SYSTEM_PROMPT}\n\n当前任务模式：${MODE_PROMPTS[mode]}` },
        { role: "user", content: `【工作区上下文】\n${context}\n\n【用户任务】\n${question}` },
      ],
      model: model.modelId,
      temperature: model.temperature ?? 0.3,
      maxTokens: Math.min(model.maxTokens ?? 2048, 8192),
      signal: AbortSignal.timeout(60_000),
    });
    return NextResponse.json({
      result: {
        answer: response.content,
        model: response.model,
        provider: model.providerType,
        latencyMs: response.latencyMs,
        usage: response.usage,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "模型调用失败";
    return NextResponse.json({ error: message, code: "MODEL_CALL_FAILED" }, { status: 502 });
  }
}
