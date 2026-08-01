import { NextResponse } from "next/server";
import { financeDb } from "@/financial-data/storage";
import {
  addManualAsset,
  updateManualAsset,
  deleteManualAsset,
} from "@/financial-data/manual";
import type { ManualAssetInput } from "@/financial-data/types";
import { getSessionUserId } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/financial-data/assets —— 当前用户全部资产持仓
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, holdings: financeDb.getHoldings(userId) });
}

/**
 * POST /api/financial-data/assets —— 手动添加资产
 * body: { name, type, code?, shares?, cost?, marketValue, totalCost? }
 */
export async function POST(req: Request) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
    }
    const body = (await req.json()) as ManualAssetInput;
    const result = addManualAsset(userId, body);
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `添加资产失败: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/financial-data/assets —— 更新资产
 * body: { id, ...patch }
 */
export async function PATCH(req: Request) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
    }
    const body = (await req.json()) as { id?: string } & Partial<ManualAssetInput>;
    if (!body.id) {
      return NextResponse.json({ ok: false, error: "缺少资产 id" }, { status: 400 });
    }
    const { id, ...patch } = body;
    const result = updateManualAsset(userId, id, patch);
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `更新资产失败: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/financial-data/assets?id=hold-xxx —— 删除资产
 */
export async function DELETE(req: Request) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
    }
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ ok: false, error: "缺少资产 id" }, { status: 400 });
    }
    const result = deleteManualAsset(userId, id);
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `删除资产失败: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
