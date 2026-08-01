import "server-only";

import { SIMULATED_MARKER } from "./types";

// ── Mock 工具公用：确定性伪随机（Phase 3.4）────────────────────────────────
// 用字符串种子生成稳定可复现的数值，保证同一标的每次返回一致，
// 便于验收与调试。真实 API 接入后此文件不再需要。

/**
 * 模拟数据声明（Phase 6.2 / 7.9）。
 * 所有 Mock 行情/基金/宏观/新闻工具使用确定性伪随机生成，并非真实市场数据。
 * 注入 LLM 与前端展示时统一前缀此声明，避免用户误将演示数据当作真实行情。
 *
 * 前缀 SIMULATED_MARKER 来自客户端安全的 types.ts，前端据此渲染模拟数据标识，
 * 保证服务端文案与前端识别逻辑同源、不会漂移。
 */
export const SIMULATED_DATA_NOTE = `${SIMULATED_MARKER}以下行情与资讯由系统生成，用于演示，并非真实市场数据，请勿作为任何投资决策依据。`;

/** FNV-1a 字符串哈希 → 32 位无符号整数。 */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * 基于种子的确定性伪随机，返回 [0,1)。
 * 多次调用同一 seed 始终得到同一值；不同 seed 分布均匀。
 */
export function pseudoRandom(seed: string): number {
  let x = hashString(seed);
  // xorshift 扰动，提升分布质量
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  x >>>= 0;
  return x / 0xffffffff;
}

/** 在 [min,max] 区间生成带 2 位小数的确定性数值。 */
export function seededValue(seed: string, min: number, max: number): number {
  const r = pseudoRandom(seed);
  return Number((min + r * (max - min)).toFixed(2));
}

/** 在 [-abs,abs] 区间生成带 2 位小数的确定性涨跌幅（%）。 */
export function seededChange(seed: string, abs: number): number {
  const r = pseudoRandom(seed);
  return Number(((r * 2 - 1) * abs).toFixed(2));
}
