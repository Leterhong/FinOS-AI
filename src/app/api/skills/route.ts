import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/auth/session";
import { listSkills } from "@/ai/skills/registry";
import { addCustomSkill, getCustomSkills, getDisabledSkills, removeCustomSkill, setDisabledSkills, type CustomSkillInput } from "@/ai/skills/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODES = new Set(["chat", "agent", "research"]);

function toItem(skill: { id: string; name: string; summary: string; category?: string; source?: string; version?: string; triggers: string[]; modes: string[]; playbook: string; custom?: boolean }, disabled: string[]) {
  return {
    id: skill.id,
    name: skill.name,
    summary: skill.summary,
    category: skill.category ?? "通用",
    source: skill.source ?? "FinOS AI 内置",
    version: skill.version ?? "1.0.0",
    triggers: skill.triggers,
    modes: skill.modes,
    playbook: skill.playbook,
    custom: Boolean(skill.custom),
    enabled: !disabled.includes(skill.id),
  };
}

/** GET /api/skills —— 列出内置 + 自定义技能及启用状态。 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const [disabled, custom] = await Promise.all([getDisabledSkills(userId), getCustomSkills(userId)]);
  const skills = [...listSkills().map((s) => toItem(s, disabled)), ...custom.map((s) => toItem(s, disabled))];
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

/** POST /api/skills —— 新增用户自定义技能。 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
  let body: Record<string, unknown> | null = null;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const playbook = typeof body?.playbook === "string" ? body.playbook.trim() : "";
  if (!name || name.length > 60) return NextResponse.json({ error: "技能名称必填且不超过 60 字" }, { status: 400 });
  if (!playbook || playbook.length > 8000) return NextResponse.json({ error: "方法论必填且不超过 8000 字" }, { status: 400 });
  const summary = typeof body?.summary === "string" ? body.summary.trim().slice(0, 200) : "";
  const category = typeof body?.category === "string" ? body.category.trim().slice(0, 40) : "";
  const triggers = Array.isArray(body?.triggers) ? body.triggers.filter((t): t is string => typeof t === "string").map((t) => t.trim()).filter(Boolean).slice(0, 50) : [];
  const modes = Array.isArray(body?.modes) ? body.modes.filter((m): m is string => typeof m === "string" && MODES.has(m)) : [];
  const input: CustomSkillInput = { name, summary, category, triggers, modes, playbook };
  const skill = await addCustomSkill(userId, input);
  return NextResponse.json({ skill: toItem(skill, await getDisabledSkills(userId)) }, { status: 201 });
}

/** DELETE /api/skills?id=xxx —— 删除用户自定义技能（内置技能不可删除）。 */
export async function DELETE(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "缺少技能 id" }, { status: 400 });
  const removed = await removeCustomSkill(userId, id);
  if (!removed) return NextResponse.json({ error: "技能不存在或不可删除" }, { status: 404 });
  return NextResponse.json({ removed: true });
}
