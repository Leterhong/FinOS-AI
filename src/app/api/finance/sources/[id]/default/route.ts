import { NextRequest, NextResponse } from "next/server";
import { financeSourceStore } from "@/finance/providers";
import { getSessionUserId } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/finance/sources/[id]/default —— 设为默认数据源 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const source = await financeSourceStore.setDefault(userId, id);
  if (!source) return NextResponse.json({ error: "数据源不存在" }, { status: 404 });
  return NextResponse.json({ source });
}
