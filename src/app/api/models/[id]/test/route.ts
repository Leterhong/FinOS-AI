import { NextRequest, NextResponse } from "next/server";
import { testSavedModel } from "@/ai/model-center/tester";
import { getSessionUserId } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/models/[id]/test —— 测试已保存的模型连接。 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  const result = await testSavedModel(userId, id);
  return NextResponse.json({ result });
}
