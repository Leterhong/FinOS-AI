import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { clearSession, getSessionUserId, isSecureContext } from "@/auth/session";
import { modelConfigStore } from "@/ai/model-center/models/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeId(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 120) || "anon";
}

/**
 * POST /api/account/purge —— 账户删除后清理 Next 侧残留：
 * 删除该工作区的模型配置/技能/用量本地文件、清内存缓存并失效会话 cookie。
 * 后端业务数据的删除由 FastAPI 的 DELETE /api/security/account 负责。
 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const safe = safeId(userId);
  const targets = [
    path.join(process.cwd(), ".data", "models", `${safe}.json.enc`),
    path.join(process.cwd(), ".data", "models", `${safe}.json`),
    path.join(process.cwd(), ".data", "skills", `${safe}.json`),
    path.join(process.cwd(), ".data", "ai-usage", `${safe}.json`),
  ];
  for (const target of targets) {
    try {
      await fs.unlink(target);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code !== "ENOENT") {
        // 单个文件删除失败不阻断其余清理。
      }
    }
  }
  modelConfigStore.forget(userId);
  await clearSession(isSecureContext(req));
  return NextResponse.json({ deleted: true });
}
