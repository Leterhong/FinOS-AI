import { NextRequest, NextResponse } from "next/server";
import { runCopilot } from "@/ai/copilot";
import { runWithModelContext } from "@/ai/model-center/context";
import { requireFinancialContext, isNeedProfile } from "@/ai/guard";

export const runtime = "nodejs";

/**
 * POST /api/ai/copilot
 * Wealth Copilot（Phase 5 四/七）：接收自然语言（如"帮我制定退休计划"/"我最近花钱太多"），
 * 编排 Monitor → Planner → Strategy → Action Agent → Task System → Memory → Notification，
 * 返回计划、任务与简报。createTasks 控制是否把计划写入 Task System。
 */
export async function POST(req: NextRequest) {
  try {
    // Phase 5.9：Financial Context Guard —— 必须拥有真实持久化画像
    const ctx = await requireFinancialContext();
    if (isNeedProfile(ctx)) return ctx;

    const body = (await req.json()) as {
      message?: string;
      goalType?: string;
      goalLabel?: string;
      runAgents?: boolean;
      createTasks?: boolean;
    };
    const result = await runWithModelContext(ctx.userId, () =>
      runCopilot({
        userId: ctx.userId,
        profile: ctx.profile,
        message: body.message,
        goalType: body.goalType,
        goalLabel: body.goalLabel,
        runAgents: body.runAgents ?? false,
        createTasks: body.createTasks ?? false,
      })
    );
    return NextResponse.json({ result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Copilot 执行失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
