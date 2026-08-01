import "server-only";

/**
 * Session 会话管理（Phase 5.6）—— 仅服务端。
 *  - 基于 HMAC 签名的 cookie（finos_session）；
 *  - 提供在 Route Handler / Server Action 中读写会话的辅助函数；
 *  - getSessionUserId 是所有 API 派生 userId 的唯一可信来源，禁止再信任客户端传参。
 */

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { signSession, verifySession, SESSION_TTL_MS } from "./crypto";
import type { SessionPayload } from "./types";

export const SESSION_COOKIE = "finos_session";

/**
 * 判断当前请求是否处于安全（HTTPS）上下文。
 * cookie 的 `secure` 标志必须依据「请求实际是否经 HTTPS 传输」，
 * 而不能只看 NODE_ENV —— `next start` 跑的是生产构建（NODE_ENV=production），
 * 但本地/Docker 默认可能仍走 HTTP；HTTP 下浏览器会拒绝存储 Secure cookie，
 * 导致 finos_session 永远种不上、登录后被 middleware 弹回 /login（死亡循环）。
 * 经反向代理（nginx）时以 X-Forwarded-Proto 为准。
 */
export function isSecureContext(req: NextRequest): boolean {
  const proto = req.headers.get("x-forwarded-proto");
  if (proto === "https") return true;
  return req.nextUrl.protocol === "https:";
}

/** 写入登录会话 cookie。secure 默认按 NODE_ENV，但调用方应传入 isSecureContext(req) 的实际结果。 */
export async function setSession(
  input: { userId: string; email: string },
  secure: boolean = process.env.NODE_ENV === "production",
): Promise<void> {
  const token = signSession(input);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

/** 清除会话 cookie（登出）。 */
export async function clearSession(
  secure: boolean = process.env.NODE_ENV === "production",
): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0,
  });
}

/** 读取并校验当前会话载荷，未登录或失效返回 null。 */
export async function getSession(): Promise<SessionPayload | null> {
  try {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    return verifySession(token);
  } catch {
    return null;
  }
}

/**
 * 获取当前登录用户的 userId —— 所有业务 API 的唯一可信 userId 来源。
 * 未登录返回 null，调用方应据此返回 401。
 */
export async function getSessionUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.userId ?? null;
}
