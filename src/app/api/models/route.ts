import { NextRequest, NextResponse } from "next/server";
import { modelConfigStore } from "@/ai/model-center/models/store";
import { getActiveModelSummary } from "@/ai/model-center/models/resolver";
import type { ProviderConfigInput, ProviderType } from "@/ai/model-center/types";
import { getSessionUserId } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/models —— 列出当前用户模型（掩码）+ 当前激活模型摘要。 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const [models, active] = await Promise.all([
    modelConfigStore.list(userId),
    getActiveModelSummary(userId),
  ]);
  return NextResponse.json({ models, active });
}

/** POST /api/models —— 添加模型。 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  let body: (ProviderConfigInput & { userId?: string }) | null = null;
  try {
    body = (await req.json()) as ProviderConfigInput & { userId?: string };
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }
  if (!body?.providerName || !body?.modelId?.trim()) {
    return NextResponse.json(
      { error: "缺少 providerName 或 modelId" },
      { status: 400 }
    );
  }
  const created = await modelConfigStore.add(userId, {
    providerName: body.providerName as ProviderType,
    displayName: body.displayName,
    modelName: body.modelName,
    modelId: body.modelId,
    baseUrl: body.baseUrl,
    apiKey: body.apiKey,
    roles: body.roles,
    temperature: body.temperature,
    maxTokens: body.maxTokens,
  });
  return NextResponse.json({ model: created }, { status: 201 });
}
