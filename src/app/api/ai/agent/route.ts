import { NextRequest, NextResponse } from "next/server";
import { getAgent } from "@/agents";
import type { AgentAnalysisOutput, FinancialContextData } from "@/ai/types";
import { contextBuilder } from "@/ai/context/ContextBuilder";
import { runWithModelContext } from "@/ai/model-center/context";
import { requireFinancialContext, isNeedProfile } from "@/ai/guard";

// 密钥仅在服务端读取，使用 Node.js 运行时以访问 process.env 与全局 fetch。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AgentBody {
  agentId?: unknown;
  context?: unknown;
  userId?: unknown;
}

export async function POST(req: NextRequest) {
  // Phase 5.9：Financial Context Guard —— 必须拥有真实持久化画像
  const ctx = await requireFinancialContext();
  if (isNeedProfile(ctx)) return ctx;

  let body: AgentBody;
  try {
    body = (await req.json()) as AgentBody;
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const { agentId, context } = body ?? {};
  if (typeof agentId !== "string" || !context) {
    return NextResponse.json(
      { error: "缺少 agentId 或 context 字段" },
      { status: 400 }
    );
  }
  try {
    const agent = getAgent(agentId);
    const clientContext = context as FinancialContextData;
    // 用服务端真实画像重建完整上下文：profile + 衍生指标 + 目标均由权威数据计算，
    // 仅保留客户端无法重建的真实金融数据摘要 / 历史 / 最近问题，杜绝占位或伪造数据驱动 Agent。
    const contextData: FinancialContextData = contextBuilder.buildFinancialData({
      profile: ctx.profile,
      activeEvents: clientContext.activeEvents ?? [],
      recentQuestions: clientContext.recentQuestions,
      history: clientContext.history,
      realData: clientContext.realData,
    });
    const result = await runWithModelContext(ctx.userId, () =>
      agent.analyze(contextData)
    );
    return NextResponse.json(result as AgentAnalysisOutput);
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知智能体错误";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
