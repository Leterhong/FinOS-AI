import { NextResponse } from "next/server";
import { getFinancialSummary } from "@/financial-data/sync";
import { generateInsights } from "@/financial-data/insight";
import { getUserConsent, logDataAccess } from "@/financial-data/consent";
import { getSessionUserId } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/financial-data/insight
 * body: { useLlm? } —— userId 取自会话。
 * Data Insight Agent：从真实金融数据发现规律（统计规则 + LLM 增强）。
 */
export async function POST(req: Request) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
    }
    const body = (await req.json()) as { userId?: string; useLlm?: boolean };

    const summary = getFinancialSummary(userId);
    if (!summary.hasData) {
      return NextResponse.json({
        ok: true,
        insights: [],
        message: "暂无金融数据，请先导入银行流水或持仓文件",
      });
    }

    // Phase 6.3 #220：数据权限层 —— 洞察分析依赖收支流水作用域
    const consent = getUserConsent(userId);
    if (consent.scopes.cashflow === false) {
      logDataAccess(userId, {
        accessor: "insight-agent",
        purpose: "数据洞察分析（被授权设置拒绝）",
        scopes: [],
        deniedScopes: ["cashflow"],
      });
      return NextResponse.json({
        ok: true,
        insights: [],
        message: "你已关闭「收支流水」数据授权，AI 无法进行洞察分析。可在数据授权设置中重新开启。",
      });
    }
    logDataAccess(userId, {
      accessor: "insight-agent",
      purpose: "数据洞察分析",
      scopes: ["cashflow", "assets"],
      deniedScopes: [],
    });

    const insights = await generateInsights(summary, { useLlm: body.useLlm !== false });
    return NextResponse.json({ ok: true, insights });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
