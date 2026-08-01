/**
 * 输入指纹哈希（Phase 6.5）。
 * 用于缓存键：相同 userId + type + question + 画像摘要 + modelName → 相同哈希。
 */
import { createHash } from "node:crypto";

export function hashInput(...parts: (string | number | undefined | null)[]): string {
  const h = createHash("sha256");
  h.update(parts.map((p) => (p === undefined || p === null ? "" : String(p))).join("|"));
  return h.digest("hex");
}
