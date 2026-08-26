import { NextResponse } from "next/server";

/** 身份查询统一由 FastAPI 处理。 */
export async function GET() {
  return NextResponse.json({ ok: false, error: "旧认证入口已停用" }, { status: 410 });
}
