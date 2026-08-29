import { NextResponse } from "next/server";
import { getActiveModelSummary } from "@/ai/model-center/models/resolver";
import { getModelHealth } from "@/ai/model-center/health";
import { getSessionUserId } from "@/auth/session";
import { withModelStoreErrors } from "@/ai/model-center/models/route-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/models/active —— 当前用户激活模型摘要 + 健康监控（Chat 徽标 / Dashboard AI Brain）。 */
async function GET_impl() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const [active, health] = await Promise.all([
    getActiveModelSummary(userId),
    getModelHealth(userId),
  ]);
  return NextResponse.json({ active, health });
}

export const GET = withModelStoreErrors(GET_impl);
