import { NextResponse } from "next/server";
import { clearSession } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/auth/logout —— 清除会话。 */
export async function POST() {
  await clearSession();
  return NextResponse.json({ ok: true });
}
