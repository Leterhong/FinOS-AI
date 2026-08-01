import { NextRequest, NextResponse } from "next/server";
import { profileManager } from "@/financial-profile";
import { wealthProfileManager } from "@/financial-profile/wealth-manager";
import { computeTwin } from "@/twin/engine";
import { generateAdvisorAlerts } from "@/twin/advisor";
import { getSessionUserId } from "@/auth/session";
import { userAccountStore } from "@/auth/store";
import type { OnboardingInput } from "@/financial-profile";

// 密钥仅在服务端读取，使用 Node.js 运行时。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/profile —— AI 财富初始化助手：
 * 接收 Onboarding 结构化输入，生成真实用户画像（Personal Financial Twin）。
 */
export async function POST(req: NextRequest) {
  // Phase 5.6：画像绑定当前登录用户，忽略客户端传入的 userId。
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: Partial<OnboardingInput>;
  try {
    body = (await req.json()) as Partial<OnboardingInput>;
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const { age, monthlyIncome, totalAssets, goals } = body ?? {};
  if (
    typeof age !== "number" ||
    typeof monthlyIncome !== "number" ||
    typeof totalAssets !== "number" ||
    !Array.isArray(goals) ||
    goals.length === 0
  ) {
    return NextResponse.json(
      { error: "缺少必填字段：age / monthlyIncome / totalAssets / goals" },
      { status: 400 }
    );
  }

  const input: OnboardingInput = {
    name: body.name,
    age,
    occupation: body.occupation,
    familyStatus: body.familyStatus,
    dependents: body.dependents,
    monthlyIncome,
    monthlyExpenses: body.monthlyExpenses,
    monthlyInvestment: body.monthlyInvestment,
    totalAssets,
    assetBreakdown: body.assetBreakdown,
    liabilities: body.liabilities,
    riskLevel: body.riskLevel ?? "moderate",
    riskExperience: body.riskExperience,
    goals,
    retirementAge: body.retirementAge,
    retirementTarget: body.retirementTarget,
    userId: sessionUserId,
  };

  const rec = profileManager.createProfile(input);
  const twin = computeTwin(rec.profile, { events: [] });
  const alerts = generateAdvisorAlerts(rec.profile, twin);

  return NextResponse.json({
    userId: rec.userId,
    profile: rec.profile,
    twin,
    alerts,
    isOnboarded: rec.isOnboarded,
  });
}

/**
 * DELETE /api/profile —— 数据管理「清除财富数据」。
 * 删除当前用户的财富画像文件，回到空状态（需重新 Onboarding）。
 */
export async function DELETE() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  // Phase 5.8：同时清除财富初始化画像，并回退 profileCompleted 标志
  profileManager.deleteProfile(userId);
  wealthProfileManager.delete(userId);
  userAccountStore.updateProfileCompleted(userId, false);
  return NextResponse.json({ ok: true });
}
