import { NextResponse } from "next/server";
import { userAccountStore } from "@/auth/store";
import { profileManager } from "@/financial-profile";
import { getSessionUserId, clearSession } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/auth/account —— 数据管理「删除账户」。
 * 删除当前登录账户（含头像引用）与其财富画像文件，并清除会话。不可逆。
 */
export async function DELETE() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  // 删除财富画像（若存在）+ 账户文件（含邮箱索引）
  profileManager.deleteProfile(userId);
  userAccountStore.delete(userId);
  await clearSession();
  return NextResponse.json({ ok: true });
}
