import { NextRequest, NextResponse } from "next/server";
import { isSecureContext, setSession } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/session —— 桥接 FastAPI 登录态与 Next.js 会话 cookie。
 *
 * 背景：前端登录走 FastAPI /auth/login（返回 JWT 存 localStorage），但 middleware.ts
 * 仅以 `finos_session` cookie 做粗粒度登录判定。本路由用前端已持有的 FastAPI JWT
 * 反查 /auth/me 校验身份，校验通过后写入 httpOnly 的 `finos_session` cookie，
 * 使 middleware 的登录判定与真实登录态一致，避免登出后跳登录页被弹回的死循环。
 */

const publicBackendUrl =
  process.env.NEXT_PUBLIC_BACKEND_URL?.replace(/\/$/, "") || "http://127.0.0.1:8300";
// Node 在部分 Windows 环境会把 localhost 优先解析为 ::1，而后端只监听 127.0.0.1，
// 从而产生间歇性 502。服务端调用允许单独配置内网地址，本地默认强制 IPv4。
const BACKEND_URL = (
  process.env.BACKEND_INTERNAL_URL?.replace(/\/$/, "") || publicBackendUrl
).replace(/^http:\/\/localhost(?=:\d+)/, "http://127.0.0.1");

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ ok: false, error: "missing token" }, { status: 401 });
  }

  try {
    const r = await fetch(`${BACKEND_URL}/api/auth/me`, {
      headers: { Authorization: auth },
      cache: "no-store",
    });
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const json = (await r.json()) as {
      success?: boolean;
      data?: { user?: { id?: string; email?: string } };
    };
    const user = json.data?.user;
    if (!user?.id || !user?.email) {
      return NextResponse.json({ ok: false, error: "bad payload" }, { status: 401 });
    }

    await setSession({ userId: user.id, email: user.email }, isSecureContext(req));
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "backend unavailable";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
