import { NextRequest, NextResponse } from "next/server";
import { requireFinancialContext, isNeedProfile } from "@/ai/guard";
import { isEmptyProfile } from "@/data/types";
import { runProactiveMonitor, buildDailyBrief } from "@/ai/proactive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RunBody {
  kind?: unknown;
}

/**
 * POST /api/ai/proactive/run —— 触发一次 AI CFO 主动体检（Phase 6.8）。
 * 事件检测 / 简报 / 行动计划全为确定性代码；仅 warn/critical 事件
 * 且预算允许且已配模型时调用 LLM 生成分级建议（成本控制）。
 */
export async function POST(req: NextRequest) {
  const ctx = await requireFinancialContext();
  if (isNeedProfile(ctx)) return ctx;

  if (isEmptyProfile(ctx.profile)) {
    return NextResponse.json(
      {
        error: "NO_REAL_DATA",
        message: "你的财富数据还未完善，请添加资产信息后开始分析。",
      },
      { status: 403 }
    );
  }

  let kind: "manual" | "daily" | "weekly" = "manual";
  try {
    const body = (await req.json()) as RunBody;
    if (body.kind === "daily" || body.kind === "weekly") kind = body.kind;
  } catch {
    /* body 可省略 */
  }

  try {
    const result = await runProactiveMonitor({
      userId: ctx.userId,
      profile: ctx.profile,
      kind,
    });
    const dailyBrief = buildDailyBrief(result);
    return NextResponse.json({ result, dailyBrief });
  } catch (err) {
    const message = err instanceof Error ? err.message : "主动体检失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
