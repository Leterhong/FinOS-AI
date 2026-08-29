import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import * as mammoth from "mammoth";
import { getSessionUserId } from "@/auth/session";
import { resolveActiveModel } from "@/ai/model-center/models/resolver";
import { ModelStoreDecryptError } from "@/ai/model-center/models/store";
import { evaluateRules, type FactCandidate, type StructuredRule } from "@/lib/rule-engine";
import { OpenAICompatibleProvider } from "@/ai/model-center/providers/OpenAICompatibleProvider";
import { parseForAnalysis } from "@/multimodal/parser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 60_000;
const MAX_FACTS = 40;
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

  let model;
  try {
    model = await resolveActiveModel(userId);
  } catch (error) {
    if (error instanceof ModelStoreDecryptError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }
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

  // ── 阶段一：结构化事实抽取（JSON 输出，逐条携带原文逐字引用）──
  let facts: FactCandidate[] = [];
  let uncertainties: string[] = [];
  try {
    const extraction = await provider.generate({
      messages: [
        {
          role: "system",
          content:
            "你是 FinOS AI 企业资料事实抽取 Agent。从给定文件文本中抽取可核验的量化事实，" +
            '只输出 JSON 对象（不要输出其他文字），结构为：{"facts":[{"topic":"主题，如 货币资金/营业收入/资产负债率","value":数值,"unit":"元|万元|亿元|%","quote":"原文片段（必须逐字来自文本）","location":"表名/行号或章节（可选）"}],"uncertainties":["无法确定或需要人工核验的点"]}。' +
            "规则：value 必须是纯数字；quote 必须是原文逐字引用，禁止改写；最多 40 条；文本中没有的事实不得编造。",
        },
        {
          role: "user",
          content: `【文件名】\n${file.name.slice(0, 240)}\n\n【文件提取文本】\n${text.slice(0, MAX_TEXT_CHARS)}`,
        },
      ],
      model: model.modelId,
      temperature: 0,
      maxTokens: Math.min(model.maxTokens ?? 3072, 4096),
      responseFormat: "json",
      signal: AbortSignal.timeout(60_000),
    });
    const parsed = JSON.parse(extraction.content || "{}") as {
      facts?: FactCandidate[];
      uncertainties?: string[];
    };
    facts = (Array.isArray(parsed.facts) ? parsed.facts : [])
      .filter((f) => f && typeof f.value === "number" && Number.isFinite(f.value) && typeof f.quote === "string" && f.quote.trim())
      .slice(0, MAX_FACTS);
    uncertainties = (Array.isArray(parsed.uncertainties) ? parsed.uncertainties : [])
      .filter((u) => typeof u === "string" && u.trim())
      .slice(0, 10);
  } catch {
    // 抽取失败不阻断主流程：事实为空 → 规则评估显式输出「未找到事实」，叙述继续。
    facts = [];
  }

  // ── 阶段二：确定性规则评估（无 LLM，可复现、可审计）──
  let structuredRules: StructuredRule[] = [];
  try {
    const parsedRules = JSON.parse(rules) as StructuredRule[];
    structuredRules = Array.isArray(parsedRules) ? parsedRules : [];
  } catch {
    structuredRules = [];
  }
  const ruleHits = evaluateRules(facts, structuredRules);

  // ── 阶段三：叙述生成（引用事实与命中，供人工复核）──
  try {
    const response = await provider.generate({
      messages: [
        {
          role: "system",
          content: `你是 FinOS AI 企业资料理解 Agent。只依据「已抽取事实」与「规则命中结果」分析，不得虚构不存在的数字、条款或规则。请用简体中文输出：\n1. 文档概要\n2. 关键事实解读（引用事实主题）\n3. 规则命中分析（对每条命中/未命中规则给出业务含义）\n4. 风险线索与不确定性\n5. 待补资料和人工复核清单\n如果事实不足，必须明确说明。输出不构成授信、投资、法律、审计或合规意见。`,
        },
        {
          role: "user",
          content: `【关联项目】\n${project}\n\n【已抽取事实（JSON）】\n${JSON.stringify(facts, null, 1).slice(0, 12_000)}\n\n【确定性规则命中（JSON）】\n${JSON.stringify(ruleHits, null, 1).slice(0, 8_000)}\n\n【抽取阶段标注的不确定性】\n${uncertainties.join("\n") || "（无）"}\n\n【文件名】\n${file.name.slice(0, 240)}\n\n【文件提取文本（供补充阅读，分析仍须以事实清单为准）】\n${text.slice(0, MAX_TEXT_CHARS / 2)}`,
        },
      ],
      model: model.modelId,
      temperature: model.temperature ?? 0.2,
      maxTokens: Math.min(model.maxTokens ?? 3072, 8192),
      signal: AbortSignal.timeout(90_000),
    });
    return NextResponse.json({
      result: {
        analysis: response.content,
        facts,
        ruleHits,
        uncertainties,
        model: response.model,
        latencyMs: response.latencyMs,
        usage: response.usage,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "模型分析失败" }, { status: 502 });
  }
}
