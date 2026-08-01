import { NextRequest, NextResponse } from "next/server";
import { userAccountStore, toPublicUser } from "@/auth/store";
import { isSecureContext, setSession } from "@/auth/session";
import type { RegisterInput } from "@/auth/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/auth/register —— 邮箱注册。
 * 注册成功即写入会话，但不创建任何财富数据（新用户进入空状态 / Onboarding）。
 */
export async function POST(req: NextRequest) {
  let body: RegisterInput;
  try {
    body = (await req.json()) as RegisterInput;
  } catch {
    return NextResponse.json({ ok: false, error: "请求体无效" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const name = body.name?.trim();

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: "邮箱格式不正确" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json(
      { ok: false, error: "密码至少 6 位" },
      { status: 400 }
    );
  }
  if (userAccountStore.emailExists(email)) {
    return NextResponse.json(
      { ok: false, error: "该邮箱已注册" },
      { status: 409 }
    );
  }

  try {
    const acc = userAccountStore.create({ email, password, name });
    await setSession({ userId: acc.id, email: acc.email }, isSecureContext(req));
    return NextResponse.json({ ok: true, user: toPublicUser(acc) });
  } catch (e) {
    const msg = e instanceof Error && e.message === "EMAIL_TAKEN" ? "该邮箱已注册" : "注册失败";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
