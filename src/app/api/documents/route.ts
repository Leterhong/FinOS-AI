import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/auth/session";
import { documentStorage, validateDocument } from "@/documents/storage";
import type { DocumentCategory } from "@/documents/types";
import { analyzeDocument } from "@/multimodal/pipeline";
import { analysisStore } from "@/multimodal/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES: DocumentCategory[] = [
  "salary",
  "asset_proof",
  "investment",
  "other",
];

/**
 * POST /api/documents —— 上传财务资料并触发 AI 理解（Phase 6.7 需求三 / 十）。
 * multipart/form-data：file（必填）、category（可选）。
 * 白名单：PDF / Excel / CSV / 图片；单文件 ≤ 10MB；按会话用户隔离。
 * 上传后同步走 Document Intelligence Pipeline，返回 document + analysis。
 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "请求必须是 multipart/form-data" },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少文件字段 file" }, { status: 400 });
  }

  const rawCategory = form.get("category");
  const category: DocumentCategory = CATEGORIES.includes(
    rawCategory as DocumentCategory
  )
    ? (rawCategory as DocumentCategory)
    : "other";

  const check = validateDocument(file.name, file.type, file.size);
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: 400 });
  }

  const content = Buffer.from(await file.arrayBuffer());
  const meta = documentStorage.save(userId, file.name, file.type, category, content);

  // ---- Document Intelligence Pipeline（AI 理解，识别失败不影响文件保存） ----
  const { analysis, cached } = await analyzeDocument({
    userId,
    docId: meta.id,
    fileName: file.name,
    mimeType: file.type,
    content,
  });

  return NextResponse.json({
    ok: true,
    document: meta,
    analysis,
    cached,
  });
}

/**
 * GET /api/documents —— 列出当前用户全部文档（合并 AI 分析状态）。
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const documents = documentStorage.list(userId);
  const analyses = analysisStore.list(userId);
  const byDoc = new Map(
    analyses
      .slice()
      .reverse() // 保留每个 docId 的最新一条
      .map((a) => [a.docId, a])
  );
  return NextResponse.json({
    ok: true,
    documents: documents.map((d) => ({
      ...d,
      analysis: byDoc.get(d.id) ?? null,
    })),
  });
}
