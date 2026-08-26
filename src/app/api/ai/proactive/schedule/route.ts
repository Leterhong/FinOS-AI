import { NextResponse } from "next/server";
import { getSessionUserId } from "@/auth/session";
import { requireFinancialContext, isNeedProfile } from "@/ai/guard";
import { isEmptyProfile } from "@/data/types";
import { computeTwin } from "@/twin/engine";
import {
  getScheduleStatus,
  runProactiveMonitor,
  buildDailyBrief,
  buildWeeklyReport,
} from "@/ai/proactive";
import type { DailyBrief, WeeklyReport } from "@/ai/proactive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/ai/proactive/schedule —— 查询每日 / 每周任务到期状态。 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  return NextResponse.json({ status: getScheduleStatus(userId) });
}

/**
 * POST /api/ai/proactive/schedule —— 执行到期任务（惰性调度）。
 * 每日体检到期 → 运行 daily 体检并生成每日简报；
 * 每周报告到期 → 运行 weekly 体检并生成每周财富报告。
 * 无到期任务时直接返回（不运行、不调 LLM）。
 */
export async function POST() {
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

  const status = getScheduleStatus(ctx.userId);
  const ran: string[] = [];
  let dailyBrief: DailyBrief | undefined;
  let weeklyReport: WeeklyReport | undefined;

  try {
    if (status.dueDaily) {
      const result = await runProactiveMonitor({
        userId: ctx.userId,
        profile: ctx.profile,
        kind: "daily",
      });
      dailyBrief = buildDailyBrief(result);
      ran.push("daily");
    }
    if (status.dueWeekly) {
      const result = await runProactiveMonitor({
        userId: ctx.userId,
        profile: ctx.profile,
        kind: "weekly",
      });
      const twin = computeTwin(ctx.profile);
      weeklyReport = buildWeeklyReport(ctx.userId, ctx.profile, twin, result);
      ran.push("weekly");
    }
    return NextResponse.json({
      ran,
      dailyBrief: dailyBrief ?? null,
      weeklyReport: weeklyReport ?? null,
      status: getScheduleStatus(ctx.userId),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "调度执行失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
