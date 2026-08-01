import { NextRequest, NextResponse } from "next/server";
import { ensureKnowledgeSeeded, financialRetriever, hitScope } from "@/knowledge";
import { getSessionUserId } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/knowledge/search（Phase 6.6 新检索内核，契约与 Phase 3.3 一致）
 * Knowledge Center 检索测试：{ query } → 双库命中片段 + 来源。userId 取自会话。
 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  let body: { query?: unknown };
  try {
    body = (await req.json()) as { query?: unknown };
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return NextResponse.json({ error: "缺少 query 字段" }, { status: 400 });
  }

  await ensureKnowledgeSeeded();
  const result = await financialRetriever.retrieve(query, 5, userId);
  return NextResponse.json({
    sources: result.sources,
    chunks: result.chunks.map((hit) => ({
      title: hit.record.chunk.title,
      category: hit.record.chunk.category,
      scope: hitScope(hit),
      score: Number(hit.score.toFixed(4)),
      text: hit.record.chunk.text.slice(0, 400),
    })),
  });
}
