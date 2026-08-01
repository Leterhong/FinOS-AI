import { NextRequest, NextResponse } from "next/server";
import { financeSourceStore } from "@/finance/providers";
import { FINANCE_PROVIDER_PRESETS } from "@/finance/providers/presets";
import type { FinanceSourceInput } from "@/finance/types";
import { getSessionUserId } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/finance/sources —— 当前用户全部金融数据源（Key 掩码） + 预设列表 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const sources = await financeSourceStore.list(userId);
  return NextResponse.json({ sources, presets: FINANCE_PROVIDER_PRESETS });
}

/** POST /api/finance/sources —— 新增数据源 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
  let body: FinanceSourceInput | null = null;
  try {
    body = (await req.json()) as FinanceSourceInput;
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }
  if (!body?.kind) {
    return NextResponse.json({ error: "缺少数据源类型 kind" }, { status: 400 });
  }
  if (body.kind === "custom" && !body.baseUrl?.trim()) {
    return NextResponse.json({ error: "自定义数据源必须填写 API 地址" }, { status: 400 });
  }
  const source = await financeSourceStore.add(userId, body);
  return NextResponse.json({ source }, { status: 201 });
}
