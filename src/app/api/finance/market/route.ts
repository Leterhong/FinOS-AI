import { NextResponse } from "next/server";
import { getMarketOverview } from "@/finance/market";
import { getSessionUserId } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/finance/market —— 市场环境概览（指数 + 纯代码趋势判断，零 LLM） */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
  try {
    const market = await getMarketOverview(userId);
    return NextResponse.json({ market });
  } catch (e) {
    return NextResponse.json(
      { error: `市场数据获取失败: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
