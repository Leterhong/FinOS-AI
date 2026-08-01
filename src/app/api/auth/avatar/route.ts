import { NextRequest, NextResponse } from "next/server";
import { userAccountStore, toPublicUser } from "@/auth/store";
import { getSessionUserId } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 1×1 透明 PNG：当无有效头像时返回，避免浏览器对缺失头像发起请求得到 404。 */
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

function serveAvatar(avatarUrl?: string): NextResponse {
  if (avatarUrl && avatarUrl.startsWith("data:image/")) {
    const m = /^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/.exec(avatarUrl);
    if (m) {
      return new NextResponse(Buffer.from(m[2], "base64"), {
        status: 200,
        headers: { "Content-Type": m[1], "Cache-Control": "no-store" },
      });
    }
  }
  return new NextResponse(TRANSPARENT_PNG, {
    status: 200,
    headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
  });
}

/**
 * GET /api/auth/avatar —— 返回当前会话用户的头像（兜底，避免基础路径 GET 得到 404）。
 * 未登录或无头像时返回 200 透明 PNG。
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return serveAvatar(undefined);
  const acc = userAccountStore.getById(userId);
  return serveAvatar(acc?.avatarUrl);
}

/** 允许的图片类型与体积上限（data URL 已裁剪压缩后，限制 ~2MB）。 */
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024;

const DATA_URL_RE = /^data:(image\/[a-zA-Z+.-]+);base64,([A-Za-z0-9+/=]+)$/;

/**
 * POST /api/auth/avatar —— 上传/更新头像。
 * 入参：{ dataUrl: "data:image/png;base64,..." }（客户端裁剪后生成）。
 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
  }

  let body: { dataUrl?: string };
  try {
    body = (await req.json()) as { dataUrl?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "请求体无效" }, { status: 400 });
  }

  const dataUrl = body.dataUrl ?? "";
  const m = DATA_URL_RE.exec(dataUrl);
  if (!m) {
    return NextResponse.json(
      { ok: false, error: "头像格式无效" },
      { status: 400 }
    );
  }
  const mime = m[1];
  if (!ALLOWED.includes(mime)) {
    return NextResponse.json(
      { ok: false, error: "仅支持 JPG / PNG / WebP" },
      { status: 400 }
    );
  }
  // base64 解码后大小估算
  const approxBytes = Math.floor((m[2].length * 3) / 4);
  if (approxBytes > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "头像体积过大（上限 2MB）" },
      { status: 413 }
    );
  }

  const acc = userAccountStore.updateAvatar(userId, dataUrl);
  if (!acc) {
    return NextResponse.json(
      { ok: false, error: "账户不存在" },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true, user: toPublicUser(acc) });
}

/** DELETE /api/auth/avatar —— 删除头像。 */
export async function DELETE() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
  }
  const acc = userAccountStore.updateAvatar(userId, undefined);
  if (!acc) {
    return NextResponse.json(
      { ok: false, error: "账户不存在" },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true, user: toPublicUser(acc) });
}
