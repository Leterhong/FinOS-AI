import "server-only";

import { NextResponse } from "next/server";
import { profileManager } from "@/financial-profile";
import { getSessionUserId } from "@/auth/session";
import type { FinancialProfile } from "@/data/types";

/**
 * Financial Context Guard（Phase 5.9）。
 *
 * 所有 LLM / 智能体 / Twin 计算入口在调用模型前，必须确认当前会话用户
 * 拥有「真实且已持久化」的财富画像。这是「去除 Mock 财富智能」的核心防线：
 *
 *  - 真实用户未创建财富画像 → 一律返回 NEED_PROFILE（403），禁止生成任何分析；
 *  - 画像数据一律以服务端存储为准（profileManager.getProfile），忽略客户端传入的
 *    profile，杜绝占位 baseProfile / 伪造数据驱动 AI 输出。
 */

export interface FinancialContext {
  /** 会话用户 id（来自签名 cookie，不可伪造）。 */
  userId: string;
  /** 服务端真实持久化的财富画像（非客户端传入）。 */
  profile: FinancialProfile;
}

/**
 * 校验并取回当前用户的真实财富上下文。
 * @returns 成功返回 FinancialContext；失败（未登录 / 无画像）返回 403 NextResponse。
 */
export async function requireFinancialContext(): Promise<FinancialContext | NextResponse> {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const rec = profileManager.getProfile(userId);
  if (!rec || !rec.profile) {
    // 无真实画像 → 禁止调用 LLM，返回 NEED_PROFILE
    return needProfileResponse();
  }
  return { userId, profile: rec.profile };
}

/** 标准 NEED_PROFILE 响应：前端据此展示「请先创建财富画像」引导。 */
export function needProfileResponse(
  message = "请先完成财富画像创建，AI 才能基于你的真实数据进行分析。"
): NextResponse {
  return NextResponse.json({ error: "NEED_PROFILE", message }, { status: 403 });
}

/** 类型守卫：判断 requireFinancialContext 的返回值是否为被拒绝的响应。 */
export function isNeedProfile(
  ctx: FinancialContext | NextResponse
): ctx is NextResponse {
  return ctx instanceof NextResponse;
}
