import { NextRequest, NextResponse } from "next/server";
import { deleteMemory, updateMemory, type MemoryType } from "@/memory";
import { getSessionUserId } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_TYPES: MemoryType[] = ["profile", "goal", "behavior", "event"];

/**
 * PATCH /api/memory/[memoryId] —— 修改单条记忆（需求十四：可修改）。
 * body: { content?, type?, importance? }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ memoryId: string }> }
) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { memoryId } = await params;
  let body: { content?: unknown; type?: unknown; importance?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const patch: Parameters<typeof updateMemory>[2] = {};
  if (typeof body.content === "string" && body.content.trim()) {
    patch.content = body.content.trim();
  }
  if (VALID_TYPES.includes(body.type as MemoryType)) {
    patch.type = body.type as MemoryType;
  }
  if (typeof body.importance === "number") {
    patch.importance = body.importance;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "没有可更新的字段" }, { status: 400 });
  }

  const updated = await updateMemory(userId, memoryId, patch);
  if (!updated) {
    return NextResponse.json({ error: "记忆不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, memory: updated });
}

/**
 * DELETE /api/memory/[memoryId] —— 删除单条记忆（需求十四/十五）。
 * 删除后 AI 将无法再读取该记忆（验收测试 5）。
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ memoryId: string }> }
) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { memoryId } = await params;
  const deleted = await deleteMemory(userId, memoryId);
  if (!deleted) {
    return NextResponse.json({ error: "记忆不存在" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
