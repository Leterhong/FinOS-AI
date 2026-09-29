import { NextRequest, NextResponse } from "next/server";
import { testDraftModel } from "@/ai/model-center/tester";
import { MODEL_PROVIDERS, type ProviderConfigInput } from "@/ai/model-center/types";
import { getSessionUserId } from "@/auth/session";
import { withModelStoreErrors } from "@/ai/model-center/models/route-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/models/test —— 测试未保存的临时配置（添加弹窗「测试连接」）。 */
async function POST_impl(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  let body: ProviderConfigInput | null = null;
  try {
    body = (await req.json()) as ProviderConfigInput;
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }
  if (!body || typeof body.providerName !== "string" || !(MODEL_PROVIDERS as readonly string[]).includes(body.providerName)) {
    return NextResponse.json({ error: "providerName 不合法" }, { status: 400 });
  }
  if (typeof body.modelId !== "string" || !body.modelId.trim()) {
    return NextResponse.json({ error: "缺少 modelId" }, { status: 400 });
  }
  const result = await testDraftModel(body);
  return NextResponse.json({ result });
}

export const POST = withModelStoreErrors(POST_impl);
