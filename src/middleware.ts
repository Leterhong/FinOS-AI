import { NextRequest, NextResponse } from "next/server";

/**
 * 路由守卫（Phase 5.6）。
 *
 * 说明：middleware 运行于 Edge，无法执行 node:crypto 完整验签，
 * 因此这里仅做「会话 cookie 存在性」粗检，负责登录态重定向（UX 层）。
 * 真正的加密校验与用户隔离由各 API 路由的 getSessionUserId()（Node 运行时）把关，
 * 伪造 cookie 可通过重定向但会在每个业务 API 被 401 拦截，不会泄露数据。
 */

const SESSION_COOKIE = "finos_session";

/** 无需登录即可访问的公开路径。 */
const PUBLIC_PATHS = ["/login", "/register", "/privacy", "/terms"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );

  // 已登录用户访问登录/注册 → 回首页
  if (hasSession && isPublic) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // 未登录访问受保护页面 → 去登录
  if (!hasSession && !isPublic) {
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

/**
 * 匹配除以下之外的所有页面路径：
 *  - /api/*（API 自行校验会话）
 *  - /_next/*（构建产物）
 *  - 常见静态资源（含扩展名的文件）
 */
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
