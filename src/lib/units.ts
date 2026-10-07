/** 金额单位换算与归一化（前后端一致口径）。

未知单位返回 NaN：宁可不出指标，也不按 1 处理造成 1000×/10000× 错误。
百分比单位（%）不在此表，调用方单独处理。
*/
export const UNIT_TO_YUAN: Record<string, number> = {
  元: 1,
  千元: 1_000,
  千: 1_000,
  万元: 10_000,
  万: 10_000,
  百万元: 1_000_000,
  百万: 1_000_000,
  亿元: 100_000_000,
  亿: 100_000_000,
};

const UNIT_ALIASES: Record<string, string> = {
  千: "千元",
  万: "万元",
  百万: "百万元",
  亿: "亿元",
};

/** 归一化常见单位写法；未知单位原样返回。 */
export function normalizeUnit(unit: string): string {
  const text = (unit || "").trim();
  return UNIT_ALIASES[text] ?? text;
}

/** 无量纲 / 比率 / 时间单位：直接使用原值，不做货币换算。 */
export const DIMENSIONLESS_UNITS = new Set([
  "%", "倍", "次", "天", "日", "年", "月", "个月", "个", "项", "人", "户", "家", "件", "台",
]);

/** 金额换算为「元」；未知单位返回 NaN。 */
export function toYuan(value: number, unit: string): number {
  const factor = UNIT_TO_YUAN[normalizeUnit(unit)];
  if (factor === undefined) return Number.NaN;
  return value * factor;
}

/**
 * 将事实值归一为可比较数值：货币类换算为元，比率/时间类（倍、天、% 等）保留原值，
 * 未知单位返回 NaN（不命中而不是按 1 处理）。
 */
export function toComparableValue(value: number, unit: string): number {
  const text = normalizeUnit(unit);
  if (DIMENSIONLESS_UNITS.has(text)) return value;
  const factor = UNIT_TO_YUAN[text];
  if (factor === undefined) return Number.NaN;
  return value * factor;
}

export const KNOWN_UNITS = new Set([...Object.keys(UNIT_TO_YUAN), ...DIMENSIONLESS_UNITS]);
