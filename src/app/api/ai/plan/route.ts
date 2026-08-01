import { NextRequest, NextResponse } from "next/server";
import { runCopilot } from "@/ai/copilot";
import { runWithModelContext } from "@/ai/model-center/context";
import { requireFinancialContext, isNeedProfile } from "@/ai/guard";

export const runtime = "nodejs";

/**
 * POST /api/ai/plan
 * 生成财富执行计划（Copilot 编排）：
 *   Monitor → Detector → Planner → Strategy → Action Agent → Task System → Memory
 * 默认 createTasks=true，把 Action Agent 拆解的任务写入 Task System。
 */
export async function POST(req: NextRequest) {
  try {
    // Phase 5.9：Financial Context Guard —— 必须拥有真实持久化画像
    const ctx = await requireFinancialContext();
    if (isNeedProfile(ctx)) return ctx;

    const body = (await req.json()) as {
      goalType?: string;
      goalLabel?: string;
      runAgents?: boolean;
      createTasks?: boolean;
    };
    const result = await runWithModelContext(ctx.userId, () =>
      runCopilot({
        userId: ctx.userId,
        profile: ctx.profile,
        goalType: body.goalType,
        goalLabel: body.goalLabel,
        runAgents: body.runAgents ?? false,
        createTasks: body.createTasks ?? true,
      })
    );
    return NextResponse.json({ result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "计划生成失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
