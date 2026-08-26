import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSession, isSecureContext, setSession } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 为无登录开源工作区签发一个匿名、隔离的服务端会话。
 * 该会话只用于模型配置和 AI 调用的数据隔离，不创建任何业务或演示数据。
 */
export async function POST(req: NextRequest) {
  const existing = await getSession();
  if (existing) {
    return NextResponse.json({ ok: true, workspaceId: existing.userId, created: false });
  }

  const workspaceId = `workspace-${randomUUID()}`;
  await setSession(
    { userId: workspaceId, email: `${workspaceId}@local.finos` },
    isSecureContext(req),
  );
  return NextResponse.json({ ok: true, workspaceId, created: true }, { status: 201 });
}
