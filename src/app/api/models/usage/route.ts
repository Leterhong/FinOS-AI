import { NextResponse } from "next/server";
import { getSessionUserId } from "@/auth/session";
import { getUsageSummary } from "@/ai/model-center/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/models/usage —— 当前工作区的模型调用用量汇总。 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
  return NextResponse.json({ usage: getUsageSummary(userId) });
}
