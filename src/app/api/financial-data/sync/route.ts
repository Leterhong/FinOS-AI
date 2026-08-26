import { NextResponse } from "next/server";
import { refreshFinancialData, getFinancialSummary } from "@/financial-data/sync";
import { getSessionUserId } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/financial-data/sync
 * userId 取自会话。数据刷新：用最新数据重建 Financial Twin 并返回摘要。
 */
export async function POST() {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
    }

    const result = refreshFinancialData(userId);
    const summary = getFinancialSummary(userId);
    return NextResponse.json({
      ok: true,
      applied: result.applied,
      updates: result.updates,
      twin: result.twin,
      summary,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
