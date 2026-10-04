import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSession, isSecureContext, setSession } from "@/auth/session";
import { modelConfigStore } from "@/ai/model-center/models/store";
import { readBodyWithLimit } from "@/lib/limited-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND = (process.env.BACKEND_PROXY_URL || "http://127.0.0.1:8300").replace(/\/+$/, "");

// 会话请求体只承载 {backendToken?, reset?}，正常仅数十字节。
const MAX_SESSION_BODY_BYTES = 4096;

/** 用后端访问令牌校验账号身份（服务端到服务端调用，浏览器看不到内部地址）。 */
async function verifyBackendToken(token: string): Promise<{ id: string; email: string } | null> {
  try {
    const resp = await fetch(`${BACKEND}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!resp.ok) return null;
    const payload = (await resp.json()) as { data?: { user?: { id?: string; email?: string } } };
    const user = payload?.data?.user;
    return user?.id ? { id: user.id, email: user.email ?? "" } : null;
  } catch {
    return null;
  }
}

/**
 * 工作区会话。
 *  - 携带后端账号令牌：把模型中心等 Next 侧数据绑定到该账号（跨设备一致）。
 *  - reset=true：退出登录后重建匿名访客工作区。
 *  - 默认：为无登录访客签发匿名隔离会话（单机体验）。
 */
export async function POST(req: NextRequest) {
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_SESSION_BODY_BYTES) {
    return NextResponse.json({ error: "请求体过大" }, { status: 413 });
  }
  const limited = await readBodyWithLimit(req, MAX_SESSION_BODY_BYTES);
  if (!limited.ok) {
    return NextResponse.json({ error: "请求体过大" }, { status: 413 });
  }
  const raw = limited.text.trim();
  let body: { backendToken?: string; reset?: boolean } | null = null;
  if (raw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
    }
    if (parsed === null) {
      body = null;
    } else if (typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "请求体必须是 JSON 对象" }, { status: 400 });
    } else {
      body = parsed as { backendToken?: string; reset?: boolean };
    }
  }

  if (body?.backendToken) {
    const account = await verifyBackendToken(body.backendToken);
    if (!account) {
      return NextResponse.json({ error: "账号令牌无效或已过期" }, { status: 401 });
    }
    const workspaceId = `acct_${account.id}`;
    // 从访客工作区绑定到账号时，把已配置的模型一并迁移到账号工作区。
    const previous = await getSession();
    if (previous?.userId && previous.userId !== workspaceId && previous.userId.startsWith("workspace-")) {
      await modelConfigStore.migrateWorkspace(previous.userId, workspaceId).catch(() => false);
    }
    await setSession({ userId: workspaceId, email: account.email }, isSecureContext(req));
    return NextResponse.json({ ok: true, workspaceId, bound: true });
  }

  if (body?.reset) {
    const workspaceId = `workspace-${randomUUID()}`;
    await setSession(
      { userId: workspaceId, email: `${workspaceId}@local.finos` },
      isSecureContext(req),
    );
    return NextResponse.json({ ok: true, workspaceId, created: true });
  }

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
