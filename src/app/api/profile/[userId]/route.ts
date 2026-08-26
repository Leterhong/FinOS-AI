import { NextResponse } from "next/server";
import { profileManager } from "@/financial-profile";
import { computeTwin } from "@/twin/engine";
import { generateAdvisorAlerts } from "@/twin/advisor";
import { getSessionUserId } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/profile/[userId] —— 获取用户画像 + Twin 快照 + 主动建议。
 * Phase 5.6 / 5.8：
 *  - userId 一律取自会话，忽略路径参数，杜绝越权读取他人画像；
 *  - 不自动创建任何默认 / 演示用户；
 *  - 画像不存在时返回 200 + { exists:false, profile:null }（新用户 → 空状态），
 *    不再返回 404，避免浏览器控制台报错。
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const rec = profileManager.getProfile(userId);
  if (!rec) {
    // 已登录但尚无画像 → 200 空响应，前端据此渲染空状态（不产生 404 控制台错误）
    return NextResponse.json({ userId, exists: false, profile: null }, { status: 200 });
  }

  const twin = computeTwin(rec.profile, { events: [] });
  const alerts = generateAdvisorAlerts(rec.profile, twin);

  return NextResponse.json({
    userId: rec.userId,
    profile: rec.profile,
    twin,
    alerts,
    isOnboarded: rec.isOnboarded,
  });
}
