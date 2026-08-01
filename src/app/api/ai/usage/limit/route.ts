/**
 * AI 调用额度设置（Phase 6.5 十一）。
 * GET  —— 读取当前用户额度
 * POST —— 设置每日最大调用次数 / 每月最大 Token
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/auth/session";
import { getQuota, setQuota } from "@/ai/orchestration/cost-manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, quota: await getQuota(userId) });
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }
  const quota = await setQuota(userId, {
    dailyCalls: Number(body.dailyCalls),
    monthlyTokens: Number(body.monthlyTokens),
  });
  return NextResponse.json({ ok: true, quota });
}
