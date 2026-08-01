import { NextResponse } from "next/server";
import { getSessionUserId } from "@/auth/session";
import { getMarketSnapshot } from "@/market/intelligence";
import { buildInvestmentTwin } from "@/twin/investment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/market/snapshot —— 投资中心统一数据入口。
 * 返回当前用户的投资孪生（组合分析 + 收益 + 风险 + 市场快照，30 天视图）。
 * ?marketOnly=1 时仅返回市场快照（不读取用户持仓）。
 * 行情缺失时优雅降级（灰灯空快照），绝不返回虚假实时行情。
 */
export async function GET(req: Request) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
    }
    const url = new URL(req.url);
    if (url.searchParams.get("marketOnly") === "1") {
      const market = await getMarketSnapshot();
      return NextResponse.json({ ok: true, market });
    }
    const twin = await buildInvestmentTwin(userId);
    return NextResponse.json({ ok: true, twin });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `投资数据获取失败: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
