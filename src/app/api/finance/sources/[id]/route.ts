import { NextRequest, NextResponse } from "next/server";
import { financeSourceStore } from "@/finance/providers";
import type { FinanceSourceInput } from "@/finance/types";
import { getSessionUserId } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PUT /api/finance/sources/[id] —— 更新数据源（apiKey 留空表示不改） */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  let body: Partial<FinanceSourceInput> | null = null;
  try {
    body = (await req.json()) as Partial<FinanceSourceInput>;
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }
  const updated = await financeSourceStore.update(userId, id, {
    kind: body?.kind,
    name: body?.name,
    baseUrl: body?.baseUrl,
    apiKey: body?.apiKey,
  });
  if (!updated) return NextResponse.json({ error: "数据源不存在" }, { status: 404 });
  return NextResponse.json({ source: updated });
}

/** DELETE /api/finance/sources/[id] —— 删除数据源 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const result = await financeSourceStore.remove(userId, id);
  if (!result.removed) return NextResponse.json({ error: "数据源不存在" }, { status: 404 });
  return NextResponse.json(result);
}
