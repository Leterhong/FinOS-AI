import { NextRequest, NextResponse } from "next/server";
import { userAccountStore } from "@/auth/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 1×1 透明 PNG：当无有效头像时返回，避免浏览器对缺失头像发起请求得到 404。 */
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * 把头像 URL（data URL 或路径）解析为图片响应。
 * - data URL：解码后按原 MIME 返回；
 * - 其余（遗留路径类、缺失）：返回 200 透明 PNG，杜绝 404 控制台报错。
 */
function serveAvatar(avatarUrl?: string): NextResponse {
  if (avatarUrl && avatarUrl.startsWith("data:image/")) {
    const m = /^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/.exec(avatarUrl);
    if (m) {
      return new NextResponse(Buffer.from(m[2], "base64"), {
        status: 200,
        headers: {
          "Content-Type": m[1],
          "Cache-Control": "no-store",
        },
      });
    }
  }
  return new NextResponse(TRANSPARENT_PNG, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * GET /api/auth/avatar/[id] —— 按用户 ID 返回头像。
 *
 * 背景：早期设计把头像存为路径 `/api/auth/avatar/{id}`，但当时未实现 GET 路由，
 * 导致前端 <img> 对其发起 GET 时得到 404（控制台红色报错）。本路由补齐该能力：
 * 命中本地账户且头像为 data URL 时返回图片，否则返回 200 透明 PNG，不再产生 404。
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const acc = userAccountStore.getById(id);
  return serveAvatar(acc?.avatarUrl);
}
