import { NextRequest, NextResponse } from "next/server";
import {
  ensureKnowledgeSeeded,
  inferFormat,
  ingestDocument,
  type KnowledgeCategory,
} from "@/knowledge";
import { getSessionUserId } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 上传大小上限：8MB。 */
const MAX_SIZE = 8 * 1024 * 1024;

/** 超过该原文长度走异步队列（需求十六：Embedding 异步，不阻塞上传）。 */
const SYNC_THRESHOLD_CHARS = 150_000;

const VALID_CATEGORIES: KnowledgeCategory[] = [
  "personal-finance",
  "investment",
  "retirement",
  "insurance",
  "tax",
  "family-wealth",
];

/**
 * POST /api/knowledge/upload （multipart/form-data: file, category?）
 * 用户个人资料上传（Phase 6.6 新摄取管线）：
 * Upload → Parse → Chunk → Embedding → VectorStore，严格按会话 userId 隔离。
 * 小文件同步完成（立即可检索）；大文件入异步队列，返回 pending 状态。
 */
export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  await ensureKnowledgeSeeded();

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
    return NextResponse.json({ error: "缺少 file 字段" }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: `文件大小需在 1B - 8MB 之间（当前 ${file.size}B）` },
      { status: 400 }
    );
  }

  const format = inferFormat(file.name);
  if (!format) {
    return NextResponse.json(
      { error: "仅支持 Markdown / TXT / PDF / DOCX 格式" },
      { status: 400 }
    );
  }

  const rawCategory = form.get("category");
  const category: KnowledgeCategory = VALID_CATEGORIES.includes(
    rawCategory as KnowledgeCategory
  )
    ? (rawCategory as KnowledgeCategory)
    : "personal-finance";

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const doc = await ingestDocument({
      userId,
      title: file.name.replace(/\.[^.]+$/, ""),
      category,
      format,
      data: buffer,
      fileName: file.name,
      // 小文件同步（响应即含 chunkCount）；大文件异步队列不阻塞上传
      waitForReady: file.size <= SYNC_THRESHOLD_CHARS,
    });

    return NextResponse.json({
      ok: true,
      document: {
        id: doc.id,
        title: doc.title,
        category: doc.category,
        format: doc.format,
        chunkCount: doc.chunkCount,
        status: doc.status,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "解析失败";
    // 解析类错误（空文本 / 依赖缺失）对用户可见且可行动
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
