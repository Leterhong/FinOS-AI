import { NextRequest, NextResponse } from "next/server";
import { getNewsForUser } from "@/finance/news";
import { getSessionUserId } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/finance/news?limit=20 —— 金融新闻流（结合持仓关联 + 重大新闻提醒）。
 * 无新闻数据源 → items 为空 + 可行动提示（绝不伪造新闻）。
 */
export async function GET(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const limit = Number(new URL(req.url).searchParams.get("limit")) || 20;
  try {
    const feed = await getNewsForUser(userId, { limit });
    return NextResponse.json(feed);
  } catch (e) {
    return NextResponse.json(
      { error: `新闻获取失败: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
