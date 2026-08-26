import { NextResponse } from "next/server";

/** 旧文件账户注册已停用；注册统一由 FastAPI 处理。 */
export async function POST() {
  return NextResponse.json({ ok: false, error: "旧认证入口已停用" }, { status: 410 });
}
