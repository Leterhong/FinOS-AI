import { NextResponse } from "next/server";
import { importFinancialFile } from "@/financial-data/sync";
import type { ImportRequest, ImportSource } from "@/financial-data/types";
import { getSessionUserId } from "@/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_SOURCES: ImportSource[] = [
  "bank-csv",
  "credit-card",
  "fund",
  "stock",
  "salary",
  "insurance-pdf",
];

/**
 * POST /api/financial-data/import
 * body: { userId, source, fileName, content, encoding }
 * 走完整管道：解析 → 归一化 → 分类 → 加密入库 → 重建 Twin。
 */
export async function POST(req: Request) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "未登录" }, { status: 401 });
    }
    const body = (await req.json()) as Partial<ImportRequest>;
    const { source, fileName, content, encoding } = body;

    if (!source || !fileName || !content) {
      return NextResponse.json(
        { ok: false, error: "缺少必要参数: source / fileName / content" },
        { status: 400 },
      );
    }
    if (!VALID_SOURCES.includes(source)) {
      return NextResponse.json(
        { ok: false, error: `不支持的数据源: ${source}` },
        { status: 400 },
      );
    }
    // 内容大小限制 10MB（base64 后约 13MB 字符）
    if (content.length > 14_000_000) {
      return NextResponse.json(
        { ok: false, error: "文件过大，最大支持 10MB" },
        { status: 413 },
      );
    }

    const result = await importFinancialFile({
      userId,
      source,
      fileName,
      content,
      encoding: encoding === "base64" ? "base64" : "utf8",
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `导入失败: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
