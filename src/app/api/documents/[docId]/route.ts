import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/auth/session";
import { documentStorage } from "@/documents/storage";
import { analysisStore } from "@/multimodal/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/documents/[docId] —— 获取文档元数据 + 最新 AI 分析结果。 */
export async function GET(
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
  return NextResponse.json({
    ok: true,
    document: doc.meta,
    analysis: analysisStore.getByDocId(userId, docId),
  });
}

/**
 * DELETE /api/documents/[docId] —— 删除文档（文件 + 元数据 + AI 分析记录）。
 * 需求十四④：删除文件后，AI 对该资料的识别结果同步清除（权限解除）。
 */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ docId: string }> }
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { docId } = await ctx.params;
  const ok = documentStorage.delete(userId, docId);
  if (!ok) {
    return NextResponse.json({ error: "文档不存在" }, { status: 404 });
  }
  const clearedAnalyses = analysisStore.removeByDocId(userId, docId);
  return NextResponse.json({ ok: true, clearedAnalyses });
}
