import { NextResponse } from "next/server";
import { getSessionUserId } from "@/auth/session";
import { proactiveStore } from "@/ai/proactive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/ai/proactive/notifications —— 当前用户的主动通知列表 + 未读数。 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const notifications = proactiveStore.listNotifications(userId);
  const unread = proactiveStore.unreadCount(userId);
  return NextResponse.json({ notifications, unread });
}

/** PATCH /api/ai/proactive/notifications —— 全部标记已读。 */
export async function PATCH() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const updated = proactiveStore.markAllRead(userId);
  return NextResponse.json({ updated });
}
