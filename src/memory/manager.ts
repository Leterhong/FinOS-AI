/**
 * Memory Manager（Phase 6.6 门面，用户需求六/九/十/十一）。
 *
 * 对上层（chat 路由 / 编排器 / Memory Center API）提供三件事：
 *   1. rememberFromUtterance：对话话语 → Extractor 判断 → 值得保存则写入；
 *   2. buildMemoryContext：问题 → 相关记忆 → 可注入 prompt 的记忆上下文；
 *   3. buildPersonalProfile：聚合高重要度画像/目标 → Personal AI Profile
 *      （需求十一：AI 知道用户是谁、目标是什么，回答更连续）。
 */
import "server-only";

import { extractMemories } from "./extractor";
import { searchMemories } from "./retriever";
import { addMemory, listMemories } from "./store";
import { MEMORY_TYPE_LABELS, type MemoryItem } from "./types";

/**
 * 对话记忆写入：抽取器判断是否值得长期保存。
 * 返回本次实际写入的记忆（空数组 = 无长期价值，未保存）。
 */
export async function rememberFromUtterance(
  userId: string,
  utterance: string
): Promise<MemoryItem[]> {
  const extracted = extractMemories(utterance);
  if (extracted.length === 0) return [];
  const saved: MemoryItem[] = [];
  for (const e of extracted) {
    saved.push(
      await addMemory({
        userId,
        type: e.type,
        content: e.content,
        slots: e.slots,
        source: "chat",
        importance: e.importance,
        evidence: e.evidence,
      })
    );
  }
  return saved;
}

/**
 * 记忆上下文：问题相关的长期记忆 → 可直接注入 prompt 的文本。
 * 空字符串 = 无相关记忆。
 */
export async function buildMemoryContext(
  userId: string,
  question: string,
  topK = 6
): Promise<string> {
  const hits = await searchMemories(userId, question, { topK });
  if (hits.length === 0) return "";
  const lines = hits.map(
    (h) => `- [${MEMORY_TYPE_LABELS[h.item.type]}] ${h.item.content}`
  );
  return `【用户长期记忆】（由过往对话与资料真实记录，请结合作答，保持连续性）\n${lines.join("\n")}`;
}

/**
 * Personal AI Profile（需求十一）：
 * 聚合该用户全部高价值记忆（importance ≥ 3），按类别组织成人格化档案，
 * 注入系统提示使 AI CFO「认识」用户。
 */
export async function buildPersonalProfile(userId: string): Promise<string> {
  const all = await listMemories(userId);
  const valuable = all.filter((m) => m.importance >= 3);
  if (valuable.length === 0) return "";

  const byType = new Map<string, string[]>();
  for (const m of valuable) {
    const label = MEMORY_TYPE_LABELS[m.type];
    const list = byType.get(label) ?? [];
    if (list.length < 8) list.push(m.content); // 每类最多 8 条防膨胀
    byType.set(label, list);
  }

  const sections = [...byType.entries()].map(
    ([label, items]) => `${label}：${items.join("；")}`
  );
  return `【Personal AI Profile · 你对该用户的长期了解】\n${sections.join("\n")}`;
}
