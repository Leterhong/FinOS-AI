/**
 * GET /api/ai/cache —— 读取当前用户最近一次 AI 分析结果（Phase 6.5 三 / 四）。
 *
 * Dashboard 加载时调用：仅读取缓存，0 次 LLM 调用，用于展示「最近一次分析结果」。
 */
import { NextResponse } from "next/server";
import { getSessionUserId } from "@/auth/session";
import { getLatestAnalysisCache } from "@/ai/orchestration/cache-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const cache = await getLatestAnalysisCache(userId);
  if (!cache) {
    return NextResponse.json({ ok: true, analysis: null });
  }
  return NextResponse.json({
    ok: true,
    analysis: {
      type: cache.type,
      createdAt: cache.createdAt,
      modelName: cache.modelName,
      resultCount: cache.result.length,
    },
  });
}
