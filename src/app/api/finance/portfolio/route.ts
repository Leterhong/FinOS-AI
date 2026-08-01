import { NextResponse } from "next/server";
import { buildPortfolioView, analyzePortfolio } from "@/finance/portfolio";
import { getPortfolioHistory } from "@/finance/market/cache";
import { getSessionUserId } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/finance/portfolio —— 投资组合视图（真实行情 + 自动计算 + 缓存降级）。
 * 返回：组合视图 / 本地智能分析 / 收益曲线历史。
 * 无投资持仓 → hasInvestments=false（前端显示「暂无投资数据」，验收测试 4）。
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
  try {
    const portfolio = await buildPortfolioView(userId);
    const analysis = analyzePortfolio(portfolio);
    const history = getPortfolioHistory(userId);
    return NextResponse.json({ portfolio, analysis, history });
  } catch (e) {
    return NextResponse.json(
      { error: `组合计算失败: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
