import { NextRequest, NextResponse } from "next/server";
import { financeSourceStore, createProvider } from "@/finance/providers";
import { getSessionUserId } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/finance/sources/[id]/test —— 测试数据源连通性。
 * 按能力选一个最轻量的探测请求（指数 / 股票 / 基金 / 新闻），回写状态与延迟。
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const config = await financeSourceStore.getRaw(userId, id);
  if (!config) return NextResponse.json({ error: "数据源不存在" }, { status: 404 });

  const provider = createProvider(config);
  if (!provider) {
    await financeSourceStore.recordTest(userId, id, {
      status: "error",
      error: "数据源配置不完整（缺少 API 地址）",
    });
    return NextResponse.json({ ok: false, error: "数据源配置不完整" }, { status: 422 });
  }

  const start = Date.now();
  try {
    if (provider.capabilities.index) {
      await provider.getMarketIndex();
    } else if (provider.capabilities.stock) {
      await provider.getStockPrice(["sh600519"]);
    } else if (provider.capabilities.fund) {
      await provider.getFundNAV(["110022"]);
    } else if (provider.capabilities.news && provider.getNews) {
      await provider.getNews({ limit: 1 });
    } else {
      throw new Error("数据源未声明任何能力");
    }
    const latencyMs = Date.now() - start;
    await financeSourceStore.recordTest(userId, id, { status: "online", latencyMs });
    return NextResponse.json({ ok: true, latencyMs });
  } catch (e) {
    const message = (e as Error).message;
    await financeSourceStore.recordTest(userId, id, {
      status: "error",
      latencyMs: Date.now() - start,
      error: message,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 422 });
  }
}
