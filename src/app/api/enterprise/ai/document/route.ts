import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import * as mammoth from "mammoth";
import { getSessionUserId } from "@/auth/session";
import { resolveActiveModel } from "@/ai/model-center/models/resolver";
import { OpenAICompatibleProvider } from "@/ai/model-center/providers/OpenAICompatibleProvider";
import { parseForAnalysis } from "@/multimodal/parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 60_000;
const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx", ".xlsx", ".xls", ".csv", ".txt", ".md", ".json"]);

/** 多编码解码：中文 Excel 导出的 CSV 常为 GBK/GB18030，不能只按 UTF-8 硬解。 */
function decodeText(content: Buffer): string {
  try {
    // utf8 对非法字节静默替换，先用严格解码探测是否真的是 UTF-8。
    return new TextDecoder("utf-8", { fatal: true }).decode(content).replace(/^\uFEFF/, "");
  } catch {
    // 非 UTF-8：Node 的 TextDecoder 支持 gb18030，按中文业务场景优先尝试。
    try {
      return new TextDecoder("gb18030").decode(content);
    } catch {
      return content.toString("latin1");
    }
  }
}

/** PDF 提取：pdf-parse（完整 CMap/编码支持）优先，失败时退回内置提取器。 */
async function extractPdf(fileName: string, content: Buffer): Promise<string> {
  try {
    const mod = (await import("pdf-parse")) as unknown as {
      default?: (b: Buffer) => Promise<{ text: string }>;
    };
    const pdfParse =
      mod.default ?? (mod as unknown as (b: Buffer) => Promise<{ text: string }>);
    const result = await pdfParse(content);
    if (result.text.trim()) return result.text;
  } catch {
    // 解析失败退回内置提取器，由上层「未提取到文本」兜底提示 OCR。
  }
  return parseForAnalysis(fileName, content).text;
}

async function extractText(file: File, content: Buffer, extension: string): Promise<string> {
  if (extension === ".docx") {
    const result = await mammoth.extractRawText({ buffer: content });
    return result.value;
  }
  if (extension === ".pdf") {
    return extractPdf(file.name, content);
  }
  if ([".xlsx", ".xls"].includes(extension)) {
    const parsed = parseForAnalysis(file.name, content);
    return parsed.text.trim() || (parsed.records.length ? JSON.stringify(parsed.records.slice(0, 500)) : "");
  }
  return decodeText(content);
}

export async function POST(req: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "工作区会话未建立" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "请求必须是 multipart/form-data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "缺少文件" }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "文件必须大于 0 且不超过 10MB" }, { status: 413 });
  }
  const extension = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return NextResponse.json({ error: "仅支持 PDF、Word、Excel、CSV、TXT、Markdown 和 JSON" }, { status: 415 });
  }

  const model = await resolveActiveModel(userId);
  if (!model) {
    return NextResponse.json({ error: "尚未配置可用的大模型", code: "NO_MODEL" }, { status: 409 });
  }

  let text: string;
  try {
    text = (await extractText(file, Buffer.from(await file.arrayBuffer()), extension)).trim();
  } catch (error) {
    return NextResponse.json({ error: `文件解析失败：${error instanceof Error ? error.message : "未知错误"}` }, { status: 422 });
  }
  if (!text) {
    return NextResponse.json({ error: "未能从文件中提取可分析文本；扫描件请先完成 OCR" }, { status: 422 });
  }

  const project = String(form.get("project") || "未关联项目").slice(0, 2_000);
  const rules = String(form.get("rules") || "[]").slice(0, 12_000);
  const provider = new OpenAICompatibleProvider(model);
  try {
    const response = await provider.generate({
      messages: [
        {
          role: "system",
          content: `你是 FinOS AI 企业资料理解 Agent。只分析用户提供的文件内容，不得虚构不存在的数字、条款、页码或规则。请用简体中文输出：\n1. 文档概要\n2. 可核验事实（逐条引用原文片段）\n3. 与给定规则可能相关的观察\n4. 风险线索与不确定性\n5. 待补资料和人工复核清单\n如果文本不足或解析质量有限，必须明确说明。输出不构成授信、投资、法律、审计或合规意见。`,
        },
        {
          role: "user",
          content: `【关联项目】\n${project}\n\n【工作区规则】\n${rules}\n\n【文件名】\n${file.name.slice(0, 240)}\n\n【文件提取文本】\n${text.slice(0, MAX_TEXT_CHARS)}`,
        },
      ],
      model: model.modelId,
      temperature: model.temperature ?? 0.2,
      maxTokens: Math.min(model.maxTokens ?? 3072, 8192),
      signal: AbortSignal.timeout(90_000),
    });
    return NextResponse.json({ result: { analysis: response.content, model: response.model, latencyMs: response.latencyMs, usage: response.usage } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "模型分析失败" }, { status: 502 });
  }
}
