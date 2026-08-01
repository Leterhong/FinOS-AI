import { NextRequest, NextResponse } from "next/server";
import { runWorkflowWithEmitter } from "@/ai/server/workflow-runner";
import { requireFinancialContext, isNeedProfile } from "@/ai/guard";
import { classifyIntent } from "@/ai/intent/router";
import { orchestrate } from "@/ai/orchestration/orchestrator";
import { routeRequest } from "@/ai/orchestration/router";
import { profileManager } from "@/financial-profile";
import { getSessionUserId } from "@/auth/session";
import { isEmptyProfile } from "@/data/types";
import { getActiveModelSummary } from "@/ai/model-center/models/resolver";
import { aiService } from "@/ai/gateway/AIService";
import {
  rememberFromUtterance,
  buildMemoryContext,
  buildPersonalProfile,
} from "@/memory";
import { retrieveKnowledge, seedSystemKnowledge } from "@/knowledge";
import type { ActiveModelSummary } from "@/ai/model-center/types";
import type { WorkflowEvent, ChatIntent } from "@/ai/types";
import type { FinancialProfile } from "@/data/types";
import type { ProfileUpdateParsed } from "@/ai/intent/router";

// 密钥仅在服务端读取，使用 Node.js 运行时以访问 process.env 与全局 fetch。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ChatBody {
  messages?: unknown;
  profile?: unknown;
  activeEvents?: unknown;
  userId?: unknown;
  lifeEventId?: unknown;
}

/** 通用知识科普系统提示：禁止引用任何个人财务数据。 */
const KNOWLEDGE_SYSTEM = `你是一位严谨的金融知识科普助手（FinOS AI 财富顾问）。请基于通用金融知识，用简洁、准确、易懂的中文回答用户的问题。
规则：
1. 只做金融 / 投资 / 理财相关的客观知识科普，不提供个性化的投资建议。
2. 不要虚构或假设用户的任何个人财务数据（如"你的资产""你的现金流"等）；仅当系统提示中明确提供了「用户长期记忆 / Personal AI Profile」时，才可以引用其中记录的信息，除此之外一律按不掌握用户资料处理。
3. 如需举例，使用通用假设（如"假设某人每月收入 1 万元"），不要指向具体个人。
4. 控制篇幅，重点清晰，必要时用要点呈现。`;

function buildGreetingReply(question: string): string {
  const identity = /(你是谁|你是什么|你叫什么|你是|你干嘛|你是什么东西|你干嘛的)/.test(question);
  const capabilities =
    "\n\n我可以帮你：\n" +
    "• 财富分析：问我「我的资产 / 现金流怎么样」\n" +
    "• 退休与理财规划：问我「如何规划 40 岁退休」\n" +
    "• 金融知识：问我「什么是基金 / 什么是 ETF」\n" +
    "• 查看模型：问我「你用的什么模型」\n\n" +
    "完善你的财富画像后，我就能基于你的真实数据为你分析、规划与复盘。有什么可以帮你的吗？";
  if (identity) {
    return (
      "我是 FinOS AI 的 AI CFO —— 你的个人 AI 财富操作系统，负责基于你的真实财富数据做分析、规划与复盘。" +
      capabilities
    );
  }
  const q = question.trim().replace(/[!！.。?？\s]+$/, "");
  return `${q}！我是 FinOS AI 的 AI CFO —— 你的个人 AI 财富操作系统。` + capabilities;
}

function buildModelInfoReply(s: ActiveModelSummary): string {
  if (!s.configured) {
    return "你还没有连接任何 AI 模型。请前往「AI 模型中心」添加并测试你的模型 API，之后我就能为你解答问题、分析财富。";
  }
  const statusText =
    s.status === "online" ? "已连接" : s.status === "error" ? "连接异常" : "尚未测试";
  return (
    `当前 AI 模型：${s.displayName || s.modelName}\n` +
    `模型标识：${s.modelName}\n` +
    `提供方：${s.providerType}\n` +
    `状态：${statusText}${s.latencyMs ? ` · 最近延迟 ${s.latencyMs}ms` : ""}\n\n` +
    `你可以通过「AI 模型中心」更换、测试或新增模型。接入你自己的模型后，我所有的分析与解答都会基于该模型生成。`
  );
}

function buildProfileUpdateReply(parsed: ProfileUpdateParsed): string {
  if (!parsed.field.numeric) {
    return (
      `已为你更新财富画像：\n` +
      `• ${parsed.field.label}：${parsed.textValue}\n\n` +
      `你可以问我「我的资产 / 现金流怎么样」来查看基于新数据的解读。`
    );
  }
  const val = parsed.value!;
  return (
    `已为你更新财富画像：\n` +
    `• ${parsed.field.label}：${val.toLocaleString("zh-CN")}${parsed.field.unit ?? ""}\n\n` +
    `你可以问我「我的资产 / 现金流怎么样」来查看基于新数据的解读。`
  );
}

function buildProfileUpdateAsk(parsed: ProfileUpdateParsed): string {
  const sample = parsed.field.numeric ? "30" : "工程师";
  return `好的，我可以帮你更新${parsed.field.label}。请告诉我新的数值，例如「我的${parsed.field.label}是 ${sample}」。`;
}

const NO_DATA_ANALYSIS_MSG =
  "你的财富数据还未完善，请添加资产信息后开始分析。";

function applyProfileUpdate(userId: string, parsed: ProfileUpdateParsed): void {
  if (parsed.field.path === "goal.retirementAge") {
    const rec = profileManager.getProfile(userId);
    if (rec) {
      profileManager.updateProfile(userId, {
        goal: { ...rec.profile.goal, retirementAge: parsed.value! },
      });
    }
    return;
  }
  if (parsed.field.path === "occupation") {
    profileManager.updateProfile(userId, { occupation: parsed.textValue });
    return;
  }
  profileManager.updateProfile(userId, {
    [parsed.field.path]: parsed.value,
  } as Partial<FinancialProfile>);
}

export async function POST(req: NextRequest) {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const { messages, activeEvents } = body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "缺少 messages 字段" }, { status: 400 });
  }

  // 取最后一条用户消息作为工作流的问题输入。
  const history = messages as { role: string; content: string }[];
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  const question = (lastUser?.content ?? "").trim();
  if (!question) {
    return NextResponse.json({ error: "messages 中未找到用户消息" }, { status: 400 });
  }

  // ── Phase 5.9.6：Intent Router —— 先识别意图，再决定走哪条链路 ──
  const intent = classifyIntent(question);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: WorkflowEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      const sendDirect = (intentType: ChatIntent, content: string) => {
        send({ type: "direct-reply", intent: intentType, content });
      };
      const sendDone = () => {
        send({
          type: "done",
          state: {
            id: "direct",
            phase: "complete",
            tasks: [],
            results: [],
            startedAt: Date.now(),
            completedAt: Date.now(),
          },
        });
      };

      try {
        // ── Phase 6.6 需求九：Memory Extractor —— 每轮对话判断是否值得长期保存 ──
        // 「今天股票涨了」不保存；「我希望45岁退休」保存。失败不阻塞对话。
        const sessionUserId = await getSessionUserId();
        if (sessionUserId) {
          try {
            await rememberFromUtterance(sessionUserId, question);
          } catch {
            /* 记忆写入失败不影响对话主流程 */
          }
        }

        // 1) 财富分析：必须持有真实且非空的财富画像，否则提示补全（禁止生成任何分析）
        if (intent.intent === "financial_analysis") {
          const ctx = await requireFinancialContext();
          if (isNeedProfile(ctx)) {
            sendDirect("financial_analysis", "请先完成财富画像创建，我才能基于你的真实数据进行分析。");
            sendDone();
            return;
          }
          if (isEmptyProfile(ctx.profile)) {
            sendDirect("financial_analysis", NO_DATA_ANALYSIS_MSG);
            sendDone();
            return;
          }
          // Phase 6.6 需求十：检索该用户长期记忆，注入分析上下文（失败降级为空）
          let memoryContext = "";
          try {
            memoryContext = await buildMemoryContext(ctx.userId, question);
          } catch {
            memoryContext = "";
          }
          // Phase 6.5：经 Orchestrator 调度 —— 缓存优先 + 按需 Agent + 预算闸门
          const routed = routeRequest(question);
          try {
            await orchestrate({
              type: routed.type,
              question,
              profile: ctx.profile,
              userId: ctx.userId,
              agents: routed.agents,
              emit: send,
              lifecycle: "user",
              memoryContext: memoryContext || undefined,
            });
          } catch (e) {
            send({ type: "error", message: (e as Error).message });
          }
          return;
        }

        // 2) 修改画像：必须持有真实画像；解析字段后更新或追问数值
        if (intent.intent === "profile_update") {
          const ctx = await requireFinancialContext();
          if (isNeedProfile(ctx)) {
            sendDirect("profile_update", "请先完成财富画像创建，我才能为你保存画像修改。");
            sendDone();
            return;
          }
          if (isEmptyProfile(ctx.profile)) {
            sendDirect(
              "profile_update",
              "你还没有填写任何财富数据，无法更新画像。请先在「财富画像」中完善基础信息，我才能为你保存修改。"
            );
            sendDone();
            return;
          }
          const parsed = intent.profileUpdate;
          if (!parsed || parsed.value === undefined) {
            sendDirect("profile_update", parsed ? buildProfileUpdateAsk(parsed) : "请告诉我你想更新哪一项财富信息，例如「修改我的年龄」或「月收入 20000 元」。");
            sendDone();
            return;
          }
          applyProfileUpdate(ctx.userId, parsed);
          sendDirect("profile_update", buildProfileUpdateReply(parsed));
          sendDone();
          return;
        }

        // 3) 模型信息：无需画像，直接读取当前激活模型摘要
        if (intent.intent === "model_info") {
          const userId = await getSessionUserId();
          const summary = userId
            ? await getActiveModelSummary(userId)
            : ({ configured: false, totalModels: 0 } as ActiveModelSummary);
          sendDirect("model_info", buildModelInfoReply(summary));
          sendDone();
          return;
        }

        // 4) 问候：无需画像，基于用户输入生成问候（不触发分析）
        if (intent.intent === "greeting") {
          sendDirect("greeting", buildGreetingReply(question));
          sendDone();
          return;
        }

        // 5) 通用金融知识：LLM 科普 + RAG 知识增强 + Personal AI Profile（Phase 6.6）
        {
          const userId = sessionUserId;

          // RAG：公共知识库 + 用户私人知识库检索，命中内容注入系统提示
          let systemPrompt = KNOWLEDGE_SYSTEM;
          try {
            await seedSystemKnowledge();
            const retrieval = await retrieveKnowledge(userId ?? "", question, { topK: 4 });
            if (retrieval.contextText) {
              systemPrompt +=
                `\n\n【参考知识（RAG 检索命中，请优先依据作答，不要照抄原文）】\n${retrieval.contextText}`;
            }
          } catch {
            /* 检索失败降级为纯 LLM 科普 */
          }

          // Personal AI Profile（需求十一）：AI 知道用户是谁、目标是什么
          if (userId) {
            try {
              const personalProfile = await buildPersonalProfile(userId);
              const memoryCtx = await buildMemoryContext(userId, question);
              if (personalProfile || memoryCtx) {
                systemPrompt +=
                  `\n\n${personalProfile}\n${memoryCtx}\n` +
                  `【连续性要求】以上是你对该用户的真实长期了解（来自过往对话记录）。回答时保持与其目标、画像的连续性；可自然引用（如"结合你 40 岁退休的目标"），但禁止编造未记录的信息。`;
              }
            } catch {
              /* 记忆读取失败降级 */
            }
          }

          let content = "";
          try {
            content = await aiService.quickGenerate(systemPrompt, question, {
              userId: userId ?? undefined,
              taskType: "reasoning",
              agentName: "AI CFO 知识解答",
            });
          } catch {
            content =
              "当前未连接 AI 模型，我暂时无法为你解答知识类问题。请前往「AI 模型中心」添加并测试你的模型 API 后重试。";
          }
          sendDirect("general_question", content);
          sendDone();
          return;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "未知对话错误";
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
