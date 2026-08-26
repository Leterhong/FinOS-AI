import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getSession } from "@/auth/session";
import { userAccountStore } from "@/auth/store";
import { profileManager } from "@/financial-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 初始化开源体验空间。
 *
 * 后端负责签发隔离的访客身份；此 TypeScript 路由负责补齐 Next.js 本地账户与
 * 一份明确标记为体验用途的财富画像。只在首次访问时创建，之后绝不覆盖用户修改。
 */
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "会话尚未就绪" }, { status: 409 });
  }

  let account = userAccountStore.getById(session.userId);
  if (!account) {
    try {
      account = userAccountStore.create({
        id: session.userId,
        email: session.email,
        name: "体验用户",
        password: randomUUID(),
      });
    } catch {
      account = userAccountStore.getById(session.userId);
    }
  }

  let record = profileManager.getProfile(session.userId);
  if (!record) {
    record = profileManager.createProfile({
      userId: session.userId,
      name: "FinOS 探索者",
      age: 31,
      occupation: "数字产品从业者",
      familyStatus: "single",
      dependents: 0,
      monthlyIncome: 32_000,
      monthlyExpenses: 14_500,
      monthlyInvestment: 9_000,
      totalAssets: 970_000,
      liabilities: 120_000,
      assetBreakdown: {
        cashSavings: 186_000,
        stockPortfolio: 236_000,
        funds: 428_000,
        bonds: 120_000,
      },
      riskLevel: "moderate",
      riskExperience: "some",
      retirementAge: 50,
      retirementTarget: 8_000_000,
      goals: [
        {
          type: "wealth-growth",
          label: "2038 年实现财务自由",
          targetYear: 2038,
          targetAmount: 8_000_000,
          priority: "high",
        },
        {
          type: "buy-house",
          label: "建立改善型住房首付金",
          targetYear: 2030,
          targetAmount: 1_500_000,
          priority: "medium",
        },
      ],
    });
  }

  userAccountStore.updateProfileCompleted(session.userId, true);
  return NextResponse.json({
    ok: true,
    created: !account?.profileCompleted,
    profileReady: Boolean(record),
  });
}
