import { NextRequest, NextResponse } from "next/server";
import { userAccountStore, toPublicUser } from "@/auth/store";
import { verifyPassword } from "@/auth/crypto";
import { isSecureContext, setSession } from "@/auth/session";
import type { LoginInput } from "@/auth/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/auth/login —— 邮箱登录。 */
export async function POST(req: NextRequest) {
  let body: LoginInput;
  try {
    body = (await req.json()) as LoginInput;
  } catch {
    return NextResponse.json({ ok: false, error: "请求体无效" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  if (!email || !password) {
    return NextResponse.json(
      { ok: false, error: "请输入邮箱和密码" },
      { status: 400 }
    );
  }

  const acc = userAccountStore.findByEmail(email);
  if (!acc || !verifyPassword(password, acc.passwordHash, acc.passwordSalt)) {
    return NextResponse.json(
      { ok: false, error: "邮箱或密码错误" },
      { status: 401 }
    );
  }

  await setSession({ userId: acc.id, email: acc.email }, isSecureContext(req));
  return NextResponse.json({ ok: true, user: toPublicUser(acc) });
}
