import "server-only";

// ── Personal Long-term Memory System 总入口（Phase 6.6）─────────────────────
// 四类长期记忆（画像/目标/行为/事件），严格 userId 隔离 + AES 加密落盘。
//
// 模块结构：
//   types.ts      类型定义
//   store.ts      存储层（增查改删 / 清除全部 / 判重 / 容量淘汰）
//   extractor.ts  Memory Extractor（判断话语是否值得长期保存）
//   retriever.ts  语义检索（相似度 + 重要度 + 新近度加权）
//   manager.ts    门面（对话写入 / 记忆上下文 / Personal AI Profile）

export * from "./types";
export {
  addMemory,
  listMemories,
  updateMemory,
  deleteMemory,
  clearMemories,
} from "./store";
export { extractMemories } from "./extractor";
export { searchMemories } from "./retriever";
export {
  rememberFromUtterance,
  buildMemoryContext,
  buildPersonalProfile,
} from "./manager";
