import "server-only";

import type { GoalType, RecognizedGoal } from "../types";
import { aiService } from "../gateway/AIService";

interface GoalCatalogEntry {
  type: GoalType;
  label: string;
}

// Catalog used for UI/display and to constrain the classifier's output.
const goalCatalog: GoalCatalogEntry[] = [
  { type: "retirement", label: "退休规划" },
  { type: "house-planning", label: "购房 / 房产规划" },
  { type: "income-optimization", label: "收入优化" },
  { type: "investment-allocation", label: "投资配置" },
  { type: "risk-assessment", label: "风险评估" },
  { type: "cashflow-analysis", label: "现金流分析" },
  { type: "debt-management", label: "债务管理" },
  { type: "insurance-planning", label: "保险规划" },
  { type: "tax-planning", label: "税务规划" },
];

const CLASSIFIER_SYSTEM_PROMPT = `你是个人财务 CFO 助手的财务意图分类器。
根据用户消息，判断其所属的单一主要财务目标。
仅返回一个 JSON 对象，格式如下：
{
  "type": [${goalCatalog.map((g) => g.type).join(", ")}] 之一,
  "label": "简短可读的中文标签",
  "confidence": 0 到 1 之间的数字,
  "entities": { "targetAge"?: number, "targetAmount"?: number },
  "followUpQuestions": string[]（1-2 个简明的澄清问题，使用简体中文）
}
若消息过于模糊无法分类，使用 type "general-question"。`;

function stripCodeFences(raw: string): string {
  const fenced = raw.trim().match(/```(?:json)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : raw).trim();
}

class GoalRecognizer {
  /**
   * Identify the primary financial goal via the LLM (real intent classification).
   * Keyword-based scoring has been removed — the model is the decision signal.
   * Returns a neutral "general-question" only as a safety fallback when the
   * model call fails (e.g. provider not configured); this is not keyword logic.
   */
  async recognize(input: string): Promise<RecognizedGoal> {
    try {
      const response = await aiService.generate(
        [
          { role: "system", content: CLASSIFIER_SYSTEM_PROMPT },
          { role: "user", content: input },
        ],
        { temperature: 0.2, responseFormat: "json", taskType: "extraction" }
      );

      const parsed = JSON.parse(stripCodeFences(response.content)) as Partial<RecognizedGoal>;
      const type = (parsed.type as GoalType) ?? "general-question";
      const catalogEntry = goalCatalog.find((g) => g.type === type);

      return {
        type,
        label: parsed.label ?? catalogEntry?.label ?? "通用财务问题",
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.8,
        entities: parsed.entities ?? {},
        followUpQuestions: Array.isArray(parsed.followUpQuestions)
          ? parsed.followUpQuestions
          : [],
      };
    } catch {
      return {
        type: "general-question",
        label: "通用财务问题",
        confidence: 0.3,
        entities: {},
        followUpQuestions: [
          "能否再多介绍一下您的财务状况？",
          "您希望重点了解财务的哪个方面？",
        ],
      };
    }
  }

  /**
   * Get all recognized goal types for UI/display.
   */
  getAllGoalTypes(): { type: GoalType; label: string }[] {
    return goalCatalog.map((g) => ({ type: g.type, label: g.label }));
  }
}

export const goalRecognizer = new GoalRecognizer();
