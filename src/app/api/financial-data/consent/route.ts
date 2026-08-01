import { NextResponse } from "next/server";
import {
  DATA_SCOPES,
  DATA_SCOPE_LABELS,
  getUserConsent,
  setUserConsent,
  type DataScope,
} from "@/financial-data/consent";
import { getSessionUserId } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/financial-data/consent —— 读取当前用户数据授权设置 + 最近审计日志。
 * PATCH /api/financial-data/consent —— body: { cashflow?, investments?, assets?, insurance? }
 * Phase 6.3 #220 Data Permission Layer。userId 一律取自会话。
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
  }
  const record = getUserConsent(userId);
  return NextResponse.json({
    ok: true,
    scopes: record.scopes,
    labels: DATA_SCOPE_LABELS,
    auditLog: record.auditLog.slice(-50).reverse(),
    updatedAt: record.updatedAt,
  });
}

export async function PATCH(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
  }
  try {
    const body = (await req.json()) as Partial<Record<DataScope, unknown>>;
    const patch: Partial<Record<DataScope, boolean>> = {};
    for (const scope of DATA_SCOPES) {
      if (typeof body[scope] === "boolean") patch[scope] = body[scope] as boolean;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json(
        { ok: false, error: "未提供任何有效的授权开关" },
        { status: 400 }
      );
    }
    const record = setUserConsent(userId, patch);
    return NextResponse.json({ ok: true, scopes: record.scopes, updatedAt: record.updatedAt });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
