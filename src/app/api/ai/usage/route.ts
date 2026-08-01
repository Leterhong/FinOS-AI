/**
 * GET /api/ai/usage —— 当前用户 AI 用量与额度（Phase 6.5 十 / 十一）。
 */
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/auth/session";
import { getUsage } from "@/ai/usage/usage-tracker";
import { getQuota } from "@/ai/orchestration/cost-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const usage = await getUsage(userId);
  const quota = await getQuota(userId);
  return NextResponse.json({ ok: true, usage, quota });
}
