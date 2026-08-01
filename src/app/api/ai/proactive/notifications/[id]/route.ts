import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/auth/session";
import { proactiveStore } from "@/ai/proactive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PatchBody {
  read?: unknown;
  dismissed?: unknown;
}

/** PATCH /api/ai/proactive/notifications/[id] —— 标记已读 / 忽略单条通知。 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await params;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const patch: { read?: boolean; dismissed?: boolean } = {};
  if (typeof body.read === "boolean") patch.read = body.read;
  if (typeof body.dismissed === "boolean") patch.dismissed = body.dismissed;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "需要 read 或 dismissed 字段" },
      { status: 400 }
    );
  }

  const updated = proactiveStore.updateNotification(userId, id, patch);
  if (!updated) {
    return NextResponse.json({ error: "通知不存在" }, { status: 404 });
  }
  return NextResponse.json({ notification: updated });
}
