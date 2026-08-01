/**
 * 用户长期记忆系统 —— 类型定义（Phase 6.6，用户需求七/八）。
 *
 * 四类长期记忆：
 *   profile  用户画像：职业 / 家庭 / 收入结构 / 风险偏好
 *   goal     用户目标："我希望 45 岁退休" / "我想买房" / "我要孩子教育金"
 *   behavior 用户行为：常问投资问题 / 常调整某类资产 / 使用习惯
 *   event    重大事件：换工作 / 买房 / 生子 / 大额支出
 *
 * 隔离：严格按 userId 分文件加密落盘 `.data/memory/{userId}.json`。
 */

/** 记忆类别。 */
export type MemoryType = "profile" | "goal" | "behavior" | "event";

export const MEMORY_TYPE_LABELS: Record<MemoryType, string> = {
  profile: "用户画像",
  goal: "人生目标",
  behavior: "行为习惯",
  event: "重大事件",
};

/** 记忆来源。 */
export type MemorySource =
  | "chat" // 对话中自动抽取
  | "onboarding" // 引导流程
  | "system" // 系统推断（如画像变更检测）
  | "manual"; // 用户在 Memory Center 手动添加/修改

/** 一条长期记忆。 */
export interface MemoryItem {
  id: string;
  userId: string;
  type: MemoryType;
  /** 记忆正文（一句话事实，如「用户希望 40 岁退休」）。 */
  content: string;
  /** 结构化槽位（可选）：如 { targetRetireAge: 40 }，供规则引擎直接读取。 */
  slots?: Record<string, string | number>;
  source: MemorySource;
  /** 重要度 1~5：抽取器打分，检索排序与淘汰时使用。 */
  importance: number;
  /** 抽取时的原始话语（溯源展示，Memory Center 用）。 */
  evidence?: string;
  createdAt: number;
  updatedAt: number;
}

/** 记忆检索命中。 */
export interface MemorySearchHit {
  item: MemoryItem;
  /** 相关度分数（语义相似度 + 重要度加权）。 */
  score: number;
}

/** Memory Extractor 的抽取结果。 */
export interface ExtractedMemory {
  type: MemoryType;
  content: string;
  slots?: Record<string, string | number>;
  importance: number;
  /** 触发抽取的原文片段。 */
  evidence: string;
}
