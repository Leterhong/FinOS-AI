import { NextRequest, NextResponse } from "next/server";
import {
  addMemory,
  clearMemories,
  listMemories,
  MEMORY_TYPE_LABELS,
  type MemoryType,
} from "@/memory";
import { getSessionUserId } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES: MemoryType[] = ["profile", "goal", "behavior", "event"];

/**
 * GET /api/memory?type=goal —— AI Memory Center 数据源（需求十四）。
 * 返回该用户的全部长期记忆（严格会话隔离）。
 */
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const typeParam = req.nextUrl.searchParams.get("type");
  const type = VALID_TYPES.includes(typeParam as MemoryType)
    ? (typeParam as MemoryType)
    : undefined;

  const items = await listMemories(userId, type);
  return NextResponse.json({
    ok: true,
    total: items.length,
    labels: MEMORY_TYPE_LABELS,
    memories: items.map((m) => ({
      id: m.id,
      type: m.type,
      content: m.content,
      source: m.source,
      importance: m.importance,
      evidence: m.evidence,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    })),
  });
}

/**
 * POST /api/memory —— 手动添加一条记忆（Memory Center 编辑能力）。
 * body: { type, content, importance? }
 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let body: { type?: unknown; content?: unknown; importance?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const type = body.type as MemoryType;
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!VALID_TYPES.includes(type) || !content) {
    return NextResponse.json(
      { error: "需要 type（profile/goal/behavior/event）与非空 content" },
      { status: 400 }
    );
  }

  const item = await addMemory({
    userId,
    type,
    content,
    source: "manual",
    importance: typeof body.importance === "number" ? body.importance : 3,
  });
  return NextResponse.json({ ok: true, memory: item });
}

/**
 * DELETE /api/memory —— 「清除所有 AI 记忆」按钮后端（需求十五）。
 */
export async function DELETE() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const cleared = await clearMemories(userId);
  return NextResponse.json({ ok: true, cleared });
}
