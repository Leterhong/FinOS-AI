import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/auth/session";
import { proactiveStore } from "@/ai/proactive";
import type { ProactiveSettings } from "@/ai/proactive";
import type { NotificationCategory } from "@/ai/monitoring/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_CATEGORIES: NotificationCategory[] = [
  "wealth",
  "risk",
  "goal",
  "opportunity",
];

/** GET /api/ai/proactive/settings —— 读取主动提醒设置。 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  return NextResponse.json({ settings: proactiveStore.getSettings(userId) });
}

/** PUT /api/ai/proactive/settings —— 更新主动提醒设置（开关 / 频率 / 关注领域）。 */
export async function PUT(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: Partial<ProactiveSettings>;
  try {
    body = (await req.json()) as Partial<ProactiveSettings>;
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const patch: Partial<ProactiveSettings> = {};
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (
    body.frequency === "daily" ||
    body.frequency === "weekly" ||
    body.frequency === "off"
  ) {
    patch.frequency = body.frequency;
  }
  if (Array.isArray(body.focusAreas)) {
    const areas = body.focusAreas.filter((a): a is NotificationCategory =>
      VALID_CATEGORIES.includes(a as NotificationCategory)
    );
    if (areas.length > 0) patch.focusAreas = areas;
  }
  if (typeof body.suppressLowPriority === "boolean") {
    patch.suppressLowPriority = body.suppressLowPriority;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "没有可更新的字段" }, { status: 400 });
  }

  const settings = proactiveStore.saveSettings(userId, patch);
  return NextResponse.json({ settings });
}
