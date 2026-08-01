import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/auth/session";
import { documentStorage } from "@/documents/storage";
import { analyzeDocument } from "@/multimodal/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/documents/[docId]/analyze —— 重新分析（需求十）。
 * 强制跳过 Document Hash 缓存，重跑完整 Pipeline。
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
  const doc = documentStorage.read(userId, docId);
  if (!doc) {
    return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  }

  const { analysis } = await analyzeDocument({
    userId,
    docId,
    fileName: doc.meta.fileName,
    mimeType: doc.meta.mimeType,
    content: doc.content,
    force: true,
  });

  const status = analysis.status === "failed" ? 422 : 200;
  return NextResponse.json({ ok: analysis.status !== "failed", analysis }, { status });
}
