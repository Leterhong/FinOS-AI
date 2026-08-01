import { NextRequest, NextResponse } from "next/server";
import { requireFinancialContext, isNeedProfile } from "@/ai/guard";
import { isEmptyProfile } from "@/data/types";
import { simulateLifeEvent, LIFE_EVENT_LABELS } from "@/ai/proactive";
import type { LifeEventInput, LifeEventType } from "@/ai/proactive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  type?: unknown;
  params?: unknown;
}

/**
 * POST /api/ai/proactive/life-event —— 人生事件模拟（Phase 6.8 需求九）。
 * 买房 / 结婚 / 生子 / 创业 / 换工作 / 退休 → 修改画像副本 → 重算 Twin → 前后对比。
 * 只读沙盘：不写回真实画像。
 */
export async function POST(req: NextRequest) {
  const ctx = await requireFinancialContext();
  if (isNeedProfile(ctx)) return ctx;

  if (isEmptyProfile(ctx.profile)) {
    return NextResponse.json(
      {
        error: "NO_REAL_DATA",
        message: "你的财富数据还未完善，请添加资产信息后开始分析。",
      },
      { status: 403 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const type = body.type as LifeEventType;
  if (!type || !(type in LIFE_EVENT_LABELS)) {
    return NextResponse.json(
      {
        error: `无效的事件类型，支持：${Object.keys(LIFE_EVENT_LABELS).join(" / ")}`,
      },
      { status: 400 }
    );
  }

  const input: LifeEventInput = {
    type,
    params:
      body.params && typeof body.params === "object"
        ? (body.params as LifeEventInput["params"])
        : undefined,
  };

  try {
    const result = simulateLifeEvent(ctx.profile, input);
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "模拟失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
