import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/auth/session";
import { analysisStore } from "@/multimodal/storage";
import { applyAnalysis } from "@/multimodal/apply";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/documents/[docId]/confirm —— 用户确认写入财富画像（需求六 / 七）。
 * AI 识别结果只有经此确认，才会写入个人金融数据库并重算 Financial Twin。
 */
export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ docId: string }> }
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { docId } = await ctx.params;
  const analysis = analysisStore.getByDocId(userId, docId);
  if (!analysis) {
    return NextResponse.json({ error: "该文档暂无分析记录" }, { status: 404 });
  }

  const result = await applyAnalysis(userId, analysis.id);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, analysis: result.analysis },
      { status: 409 }
    );
  }

  return NextResponse.json({
    ok: true,
    analysis: result.analysis,
    batch: result.batch,
    twin: {
      applied: result.twin?.applied ?? false,
      updates: result.twin?.updates ?? {},
      netWorth: result.twin?.twin?.netWorth ?? null,
      totalAssets: result.twin?.twin?.totalAssets ?? null,
      onTrack: result.twin?.twin?.onTrack ?? null,
    },
    changes: result.changes ?? null,
  });
}
