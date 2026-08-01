import { NextRequest, NextResponse } from "next/server";
import { runPlayground } from "@/ai/model-center/tester";
import { getSessionUserId } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/models/playground —— 用当前/指定模型跑测试问题（Model Playground）。 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  let body: { userId?: string; question?: string; modelId?: string } | null = null;
  try {
    body = (await req.json()) as { userId?: string; question?: string; modelId?: string };
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }
  const question = (body?.question ?? "").trim();
  if (!question) {
    return NextResponse.json({ error: "缺少 question" }, { status: 400 });
  }
  const result = await runPlayground(userId, question, body?.modelId);
  return NextResponse.json({ result });
}
