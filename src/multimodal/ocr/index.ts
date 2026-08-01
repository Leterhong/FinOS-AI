import "server-only";

/**
 * OCR Provider 抽象层（需求四）。
 *  - 统一接口：图片 Buffer → 纯文本；
 *  - 默认实现 VisionModelOcrProvider：走用户 BYOM 的视觉模型（aiService）；
 *  - 未配置视觉模型时优雅降级：返回 available=false 的明确指引，绝不伪造文本；
 *  - 未来可插拔本地 OCR（tesseract）/ 云 OCR，实现同一接口即可。
 */

import { aiService, AIError } from "@/ai/gateway/AIService";
import type { AIMessage } from "@/ai/types";

export interface OcrResult {
  ok: boolean;
  text: string;
  provider: string;
  /** 失败 / 降级原因（ok=false 时必填，须可行动） */
  error?: string;
  warnings: string[];
}

export interface OCRProvider {
  readonly name: string;
  recognize(image: Buffer, mimeType: string, userId: string): Promise<OcrResult>;
}

const OCR_SYSTEM =
  "你是专业的财务资料 OCR 引擎。用户会给你一张财务相关图片（银行卡余额截图、基金/股票持仓截图、工资单照片、账单等）。" +
  "请逐字提取图片中的全部文字内容，保持表格行列结构（每行一条记录，字段用竖线 | 分隔）。" +
  "只输出提取的文字，不要任何解释、评论或 markdown 代码块。如果图片没有可读文字，输出 [NO_TEXT]。";

/** 基于用户视觉模型的 OCR 实现（默认） */
export class VisionModelOcrProvider implements OCRProvider {
  readonly name = "vision-llm";

  async recognize(
    image: Buffer,
    mimeType: string,
    userId: string
  ): Promise<OcrResult> {
    const dataUrl = `data:${mimeType};base64,${image.toString("base64")}`;
    const messages: AIMessage[] = [
      { role: "system", content: OCR_SYSTEM },
      {
        role: "user",
        content: "请提取这张财务图片中的全部文字。",
        parts: [
          { type: "text", text: "请提取这张财务图片中的全部文字。" },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ];
    try {
      const res = await aiService.generate(messages, {
        taskType: "vision",
        userId,
        agentName: "multimodal-ocr",
        temperature: 0,
        maxTokens: 4096,
      });
      const text = res.content.trim();
      if (!text || text.includes("[NO_TEXT]")) {
        return {
          ok: false,
          text: "",
          provider: this.name,
          error: "图片中未识别到可读文字（可能过于模糊或非文字图片）",
          warnings: [],
        };
      }
      return { ok: true, text, provider: this.name, warnings: [] };
    } catch (err) {
      const isNoModel =
        err instanceof AIError && err.code === "NO_USER_MODEL";
      return {
        ok: false,
        text: "",
        provider: this.name,
        error: isNoModel
          ? "尚未配置 AI 模型，无法识别图片。请先在「AI 模型中心」连接一个支持视觉（Vision）的模型"
          : `图片识别失败：${(err as Error).message}。请确认所配置模型支持图片输入（Vision）`,
        warnings: [],
      };
    }
  }
}

/** OCR Provider 工厂（当前默认视觉模型实现，预留扩展） */
export function createOcrProvider(): OCRProvider {
  return new VisionModelOcrProvider();
}
