import { NextRequest, NextResponse } from "next/server";
import { computeTwin } from "@/twin/engine";
import { generateReview } from "@/ai/review";
import type { ReviewType } from "@/ai/review";
import { requireFinancialContext, isNeedProfile } from "@/ai/guard";

export const runtime = "nodejs";

/**
 * POST /api/ai/review
 * 生成财富复盘报告（Phase 5 六）：周 / 月 / 年。
 */
export async function POST(req: NextRequest) {
  try {
    // Phase 5.9：Financial Context Guard —— 必须拥有真实持久化画像
    const ctx = await requireFinancialContext();
    if (isNeedProfile(ctx)) return ctx;

    const body = (await req.json()) as {
      type?: ReviewType;
    };
    const type = body.type ?? "monthly";
    const twin = computeTwin(ctx.profile);
    const report = generateReview(type, ctx.userId, ctx.profile, twin);
    return NextResponse.json({ report });
  } catch (e) {
    const message = e instanceof Error ? e.message : "复盘生成失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
