import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/auth/session";
import { listSkills } from "@/ai/skills/registry";
import { getDisabledSkills, setDisabledSkills } from "@/ai/skills/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/skills —— 列出全部专属技能及当前启用状态。 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const disabled = await getDisabledSkills(userId);
  const skills = listSkills().map((skill) => ({
    id: skill.id,
    name: skill.name,
    summary: skill.summary,
    category: skill.category ?? "通用",
    source: skill.source ?? "FinOS AI 内置",
    version: skill.version ?? "1.0.0",
    triggers: skill.triggers,
    modes: skill.modes,
    playbook: skill.playbook,
    enabled: !disabled.includes(skill.id),
  }));
  return NextResponse.json({ skills, disabled });
}

/** PUT /api/skills —— 保存启用状态（body: { disabled: string[] }）。 */
export async function PUT(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
  let body: { disabled?: unknown } | null = null;
  try {
    body = (await req.json()) as { disabled?: unknown };
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }
  if (!Array.isArray(body?.disabled)) {
    return NextResponse.json({ error: "缺少 disabled 列表" }, { status: 400 });
  }
  const disabled = await setDisabledSkills(userId, body.disabled);
  return NextResponse.json({ disabled });
}
