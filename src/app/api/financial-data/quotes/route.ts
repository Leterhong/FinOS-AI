import { NextResponse } from "next/server";
import { syncHoldingQuotes } from "@/financial-data/sync";
import { getStockProvider, getFundProvider } from "@/financial-data/providers";
import { getSessionUserId } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/financial-data/quotes?type=stock|fund&code=600519
 * 查询单只证券的实时报价（Mock Provider，标注 simulated）。
 */
export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
  }
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "stock";
  const code = url.searchParams.get("code")?.trim();
  if (!code) {
    return NextResponse.json({ ok: false, error: "缺少证券代码" }, { status: 400 });
  }
  const provider = type === "fund" ? getFundProvider() : getStockProvider();
  const quote = await provider.getQuote(code);
  if (!quote) {
    return NextResponse.json({ ok: false, error: "未查询到报价" }, { status: 404 });
  }
  // simulated 必须随响应透传（Phase 7.9）：调用方据此渲染「模拟数据」标识，
  // 避免伪随机报价被当作真实行情展示。
  return NextResponse.json({ ok: true, quote, simulated: provider.simulated });
}

/**
 * POST /api/financial-data/quotes —— 行情同步：
 * 用 Provider 最新报价刷新当前用户股票 / 基金持仓市值并重建 Twin。
 */
export async function POST() {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
    }
    const result = await syncHoldingQuotes(userId);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `行情同步失败: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
