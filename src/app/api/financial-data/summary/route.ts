import { NextResponse } from "next/server";
import { getFinancialSummary } from "@/financial-data/sync";
import { financeDb } from "@/financial-data/storage";
import { getSessionUserId } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/financial-data/summary?transactions=1
 * 返回当前登录用户金融数据摘要（userId 取自会话，忽略查询参数）。
 * transactions=1 时附带最近 100 笔交易明细。
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
    }

    const summary = getFinancialSummary(userId);
    const withTx = url.searchParams.get("transactions") === "1";
    const transactions = withTx
      ? financeDb.getTransactions(userId).slice(-100).reverse()
      : undefined;
    const holdings = withTx ? financeDb.getHoldings(userId) : undefined;
    const policies = withTx ? financeDb.getPolicies(userId) : undefined;

    return NextResponse.json({ ok: true, summary, transactions, holdings, policies });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
