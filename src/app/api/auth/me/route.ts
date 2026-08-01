import { NextResponse } from "next/server";
import { userAccountStore, toPublicUser } from "@/auth/store";
import { getSessionUserId } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/me —— 返回当前登录用户的安全视图。
 * 未登录返回 401（前端据此跳转登录页）。
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
  }
  const acc = userAccountStore.getById(userId);
  if (!acc) {
    return NextResponse.json(
      { ok: false, error: "账户不存在" },
      { status: 401 }
    );
  }
  return NextResponse.json({ ok: true, user: toPublicUser(acc) });
}
