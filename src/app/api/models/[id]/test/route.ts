import { NextRequest, NextResponse } from "next/server";
import { testSavedModel } from "@/ai/model-center/tester";
import { getSessionUserId } from "@/auth/session";
import { withModelStoreErrors } from "@/ai/model-center/models/route-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/models/[id]/test —— 测试已保存的模型连接。 */
async function POST_impl(
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

export const POST = withModelStoreErrors(POST_impl);
