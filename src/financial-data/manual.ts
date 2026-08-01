import "server-only";

/**
 * Manual Asset Service —— 手动添加 / 编辑 / 删除资产。
 * 与文件导入共用同一存储（financeDb）与孪生重建管道（rebuildTwinFromData），
 * 保证「手动录入的现金 / 股票 / 房产」与「导入的持仓」进入同一个统一 Asset Schema。
 */

import { financeDb } from "./storage";
import { rebuildTwinFromData, type TwinRebuildResult } from "./twin-builder";
import type { AssetHolding, HoldingType, ManualAssetInput } from "./types";
import { HOLDING_TYPE_LABELS } from "./types";

export interface ManualAssetResult {
  ok: boolean;
  holding?: AssetHolding;
  twin?: TwinRebuildResult;
  error?: string;
}

const VALID_TYPES = new Set<HoldingType>(
  Object.keys(HOLDING_TYPE_LABELS) as HoldingType[],
);

/** 校验手动资产入参，返回错误信息（null=通过） */
export function validateManualAsset(input: Partial<ManualAssetInput>): string | null {
  if (!input.name || !input.name.trim()) return "请填写资产名称";
  if (input.name.trim().length > 60) return "资产名称过长（最多 60 字）";
  if (!input.type || !VALID_TYPES.has(input.type)) return "无效的资产类型";
  if (typeof input.marketValue !== "number" || !Number.isFinite(input.marketValue)) {
    return "请填写有效的当前价值";
  }
  if (input.marketValue < 0) return "当前价值不能为负数";
  if (input.marketValue > 1e13) return "当前价值超出合理范围，请确认金额";
  for (const [field, label] of [
    ["shares", "份额"],
    ["cost", "单位成本"],
    ["totalCost", "累计成本"],
  ] as const) {
    const v = input[field];
    if (v != null && (typeof v !== "number" || !Number.isFinite(v) || v < 0)) {
      return `请填写有效的${label}`;
    }
  }
  return null;
}

/** 手动添加一条资产，并自动重建 Financial Twin */
export function addManualAsset(userId: string, input: ManualAssetInput): ManualAssetResult {
  const err = validateManualAsset(input);
  if (err) return { ok: false, error: err };
  try {
    const holding = financeDb.addManualHolding(userId, input);
    const twin = rebuildTwinFromData(userId);
    return { ok: true, holding, twin };
  } catch (e) {
    return { ok: false, error: `添加资产失败: ${(e as Error).message}` };
  }
}

/** 更新一条资产，并自动重建 Financial Twin */
export function updateManualAsset(
  userId: string,
  holdingId: string,
  patch: Partial<ManualAssetInput>,
): ManualAssetResult {
  if (patch.marketValue != null && (!Number.isFinite(patch.marketValue) || patch.marketValue < 0)) {
    return { ok: false, error: "请填写有效的当前价值" };
  }
  if (patch.type && !VALID_TYPES.has(patch.type)) {
    return { ok: false, error: "无效的资产类型" };
  }
  try {
    const holding = financeDb.updateHolding(userId, holdingId, patch);
    if (!holding) return { ok: false, error: "资产不存在或无权访问" };
    const twin = rebuildTwinFromData(userId);
    return { ok: true, holding, twin };
  } catch (e) {
    return { ok: false, error: `更新资产失败: ${(e as Error).message}` };
  }
}

/** 删除一条资产，并自动重建 Financial Twin */
export function deleteManualAsset(userId: string, holdingId: string): ManualAssetResult {
  try {
    const removed = financeDb.deleteHolding(userId, holdingId);
    if (!removed) return { ok: false, error: "资产不存在或无权访问" };
    const twin = rebuildTwinFromData(userId);
    return { ok: true, twin };
  } catch (e) {
    return { ok: false, error: `删除资产失败: ${(e as Error).message}` };
  }
}
