import "server-only";

/**
 * Vision Agent（需求八）—— 图片理解：截图 → 结构化金融行记录。
 *  - 输入：银行卡余额截图 / 基金收益截图 / 股票持仓截图 / 工资单照片；
 *  - 输出：RawRecord[]（与文件解析器同构，直接进 Financial Extraction Agent）
 *    + 识别文本（溯源展示）；
 *  - 优先让视觉模型直接输出 JSON 行记录；解析失败时回退 OCR 纯文本；
 *  - 未配置视觉模型时明确降级，绝不伪造数据。
 */

import { aiService, AIError } from "@/ai/gateway/AIService";
import type { AIMessage } from "@/ai/types";
import type { RawRecord } from "@/financial-data/types";
import { createOcrProvider } from "../ocr";
import type { MultimodalDocKind } from "../types";

export interface VisionAnalyzeResult {
  ok: boolean;
  /** 结构化行记录（可直接进抽取管线） */
  records: RawRecord[];
  /** 识别出的原始文本（溯源） */
  text: string;
  /** 模型判断的文档类型提示 */
  kindHint?: MultimodalDocKind;
  error?: string;
  warnings: string[];
}

const VISION_SYSTEM = `你是专业的财务截图理解引擎。用户给你一张财务相关图片，请提取其中的金融数据并输出严格 JSON（不要 markdown 代码块）：
{
  "kind": "payslip|bank-statement|holdings|expense|asset-sheet|unknown",
  "rows": [
    {
      "date": "日期（原文，可空）",
      "description": "描述/摘要（可空）",
      "merchant": "商户/对手方（可空）",
      "amount": "金额原文（含符号，可空）",
      "type": "收/支/转账等原始类型（可空）",
      "balance": "余额（可空）",
      "name": "持仓名称，如股票/基金名（持仓类必填）",
      "code": "代码（可空）",
      "shares": "份额/股数（可空）",
      "price": "单价/净值（可空）",
      "marketValue": "市值/金额（持仓类必填）"
    }
  ],
  "text": "图片全部可读文字"
}
规则：只提取图片中真实存在的数据，绝不编造；数字保留原文字符串；没有的字段省略或留空。`;

interface VisionJson {
  kind?: string;
  rows?: Record<string, unknown>[];
  text?: string;
}

const KNOWN_KINDS: MultimodalDocKind[] = [
  "payslip",
  "bank-statement",
  "holdings",
  "expense",
  "asset-sheet",
];

function toRawRecords(rows: Record<string, unknown>[]): RawRecord[] {
  return rows.map((row, i) => {
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      if (v != null && String(v).trim() !== "") fields[k] = String(v);
    }
    return {
      fields,
      rowIndex: i + 1,
      date: fields.date,
      description: fields.description ?? fields.name,
      merchant: fields.merchant,
      amount: fields.amount ?? fields.marketValue,
      rawType: fields.type,
      balance: fields.balance,
    };
  });
}

/** 从模型输出中提取 JSON（容忍 markdown 代码块包裹） */
function parseJsonLoose(raw: string): VisionJson | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as VisionJson;
  } catch {
    return null;
  }
}

/** 图片理解主入口 */
export async function analyzeImage(input: {
  userId: string;
  image: Buffer;
  mimeType: string;
}): Promise<VisionAnalyzeResult> {
  const dataUrl = `data:${input.mimeType};base64,${input.image.toString("base64")}`;
  const messages: AIMessage[] = [
    { role: "system", content: VISION_SYSTEM },
    {
      role: "user",
      content: "请理解这张财务图片并输出 JSON。",
      parts: [
        { type: "text", text: "请理解这张财务图片并输出 JSON。" },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
    },
  ];

  try {
    const res = await aiService.generate(messages, {
      taskType: "vision",
      userId: input.userId,
      agentName: "multimodal-vision",
      temperature: 0,
      maxTokens: 4096,
      responseFormat: "json",
    });

    const parsed = parseJsonLoose(res.content);
    if (parsed?.rows?.length) {
      const kindHint = KNOWN_KINDS.includes(parsed.kind as MultimodalDocKind)
        ? (parsed.kind as MultimodalDocKind)
        : undefined;
      return {
        ok: true,
        records: toRawRecords(parsed.rows),
        text: parsed.text ?? "",
        kindHint,
        warnings: [],
      };
    }

    // JSON 解析失败 → 回退 OCR 纯文本
    const ocr = await createOcrProvider().recognize(
      input.image,
      input.mimeType,
      input.userId
    );
    if (ocr.ok) {
      return {
        ok: true,
        records: [],
        text: ocr.text,
        warnings: ["视觉模型未返回结构化数据，已回退为 OCR 文本识别"],
      };
    }
    return {
      ok: false,
      records: [],
      text: "",
      error: ocr.error ?? "图片识别失败",
      warnings: [],
    };
  } catch (err) {
    const isNoModel = err instanceof AIError && err.code === "NO_USER_MODEL";
    return {
      ok: false,
      records: [],
      text: "",
      error: isNoModel
        ? "尚未配置 AI 模型，无法识别图片。请先在「AI 模型中心」连接一个支持视觉（Vision）的模型"
        : `图片理解失败：${(err as Error).message}。请确认所配置模型支持图片输入（Vision）`,
      warnings: [],
    };
  }
}
