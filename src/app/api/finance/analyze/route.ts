import { NextRequest, NextResponse } from "next/server";
import { runInvestmentIntelligence } from "@/finance/intelligence";
import { requireFinancialContext, isNeedProfile } from "@/ai/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/finance/analyze —— AI 投资分析流程（需求十）。
 * 用户资产 → Portfolio Engine → Market Data → Risk Agent → Investment Agent → AI CFO。
 * body: { wantAI?: boolean }（用户主动请求 LLM 解读；否则仅风险信号触发时才调 LLM）。
 */
export async function POST(req: NextRequest) {
  const ctx = await requireFinancialContext();
  if (isNeedProfile(ctx)) return ctx;

  let wantAI = false;
  try {
    const body = (await req.json()) as { wantAI?: boolean } | null;
    wantAI = body?.wantAI === true;
  } catch {
    /* 空 body 允许 */
  }

  try {
    const result = await runInvestmentIntelligence(ctx.userId, ctx.profile, { wantAI });
    return NextResponse.json({ result });
  } catch (e) {
    return NextResponse.json(
      { error: `投资分析失败: ${(e as Error).message}` },
      { status: 500 },
    );
  }
}
