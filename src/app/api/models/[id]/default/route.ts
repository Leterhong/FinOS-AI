import { NextRequest, NextResponse } from "next/server";
import { modelConfigStore } from "@/ai/model-center/models/store";
import { getSessionUserId } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/models/[id]/default —— 设为默认模型（模型切换）。 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  const updated = await modelConfigStore.setDefault(userId, id);
  if (!updated) {
    return NextResponse.json({ error: "模型不存在" }, { status: 404 });
  }
  return NextResponse.json({ model: updated });
}
