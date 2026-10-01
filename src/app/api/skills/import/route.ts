import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/auth/session";
import { parseSkillFile } from "@/ai/skills/import";
import { scanSkillContent } from "@/ai/skills/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** POST /api/skills/import —— 上传技能文件/压缩包，解析并返回候选技能与风险扫描结果。 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_UPLOAD_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "文件过大（上限 5MB）" }, { status: 413 });
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const value = form.get("file");
    if (value instanceof File) file = value;
  } catch {
    return NextResponse.json({ error: "请求体不是合法的上传表单" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "缺少上传文件" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "文件过大（上限 5MB）" }, { status: 413 });

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseSkillFile(file.name, buffer);
    const risks = scanSkillContent(parsed.text);
    return NextResponse.json({
      candidate: parsed.candidate,
      risks,
      files: parsed.files,
      sourceFile: parsed.sourceFile,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "技能文件解析失败" }, { status: 422 });
  }
}
