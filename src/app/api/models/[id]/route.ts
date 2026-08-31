import { NextRequest, NextResponse } from "next/server";
import { modelConfigStore } from "@/ai/model-center/models/store";
import { MODEL_ROLES, type ProviderConfigInput } from "@/ai/model-center/types";
import { getSessionUserId } from "@/auth/session";
import { withModelStoreErrors } from "@/ai/model-center/models/route-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PUT /api/models/[id] —— 更新模型（apiKey 留空表示不改）。 */
async function PUT_impl(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  let body: (Partial<ProviderConfigInput> & { userId?: string }) | null = null;
  try {
    body = (await req.json()) as Partial<ProviderConfigInput> & { userId?: string };
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }
  if (body?.roles !== undefined && (!Array.isArray(body.roles) || body.roles.length > MODEL_ROLES.length || body.roles.some((role) => !MODEL_ROLES.includes(role)))) {
    return NextResponse.json({ error: "模型任务角色不合法" }, { status: 400 });
  }
  const updated = await modelConfigStore.update(userId, id, {
    providerName: body?.providerName,
    displayName: body?.displayName,
    modelName: body?.modelName,
    modelId: body?.modelId,
    baseUrl: body?.baseUrl,
    apiKey: body?.apiKey,
    roles: body?.roles,
    temperature: body?.temperature,
    maxTokens: body?.maxTokens,
  });
  if (!updated) {
    return NextResponse.json({ error: "模型不存在" }, { status: 404 });
  }
  return NextResponse.json({ model: updated });
}

/** DELETE /api/models/[id]?userId= —— 删除模型，返回自动回退的新默认 id。 */
async function DELETE_impl(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  const result = await modelConfigStore.remove(userId, id);
  if (!result.removed) {
    return NextResponse.json({ error: "模型不存在" }, { status: 404 });
  }
  return NextResponse.json({ removed: true, newDefaultId: result.newDefaultId });
}

export const PUT = withModelStoreErrors(PUT_impl);

export const DELETE = withModelStoreErrors(DELETE_impl);
