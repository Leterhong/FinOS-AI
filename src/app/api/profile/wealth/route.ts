import { NextRequest, NextResponse } from "next/server";
import { profileManager } from "@/financial-profile";
import { wealthProfileManager, toFinancialProfile } from "@/financial-profile/wealth-manager";
import type {
  IncomeSource,
  IncomeStability,
  MaritalStatus,
  WealthGoalType,
  WealthProfile,
} from "@/financial-profile/wealth-types";
import { computeTwin } from "@/twin/engine";
import { generateAdvisorAlerts } from "@/twin/advisor";
import { getSessionUserId } from "@/auth/session";
import { userAccountStore } from "@/auth/store";
import { detectChanges } from "@/ai/orchestration/change-detector";
import { invalidateUser } from "@/ai/orchestration/cache-manager";
import { orchestrate } from "@/ai/orchestration/orchestrator";
import { scheduler } from "@/ai/orchestration/scheduler";

// 仅服务端运行（密钥与文件系统）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/profile/wealth —— 财富初始化（Phase 5.8）。
 * 接收 7 步引导采集的结构化数据，生成 WealthProfile（financial_profiles）
 * + FinancialProfile（计算镜像），并标记账户 profileCompleted=true。
 */
export async function POST(req: NextRequest) {
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const age = Number(body.age);
  const income = Number(body.income);
  const assets = body.assets as Record<string, unknown> | undefined;

  if (!age || age <= 0 || age > 120 || !income || income < 0 || !assets || typeof assets !== "object") {
    return NextResponse.json(
      { error: "缺少必填字段：age / income / assets" },
      { status: 400 }
    );
  }

  // 姓名：优先取用户填写；未填写则回落到账户已有显示名（真实数据，不伪造人设）
  const account = userAccountStore.getById(sessionUserId);
  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim()
      : account?.name || "";
  const occupation = typeof body.occupation === "string" ? body.occupation.trim() || undefined : undefined;
  const city = typeof body.city === "string" ? body.city.trim() || undefined : undefined;

  // 家庭情况（可选，不填即空）
  const MARITAL: MaritalStatus[] = ["single", "married", "divorced", "widowed"];
  const maritalStatus = MARITAL.includes(body.maritalStatus as MaritalStatus)
    ? (body.maritalStatus as MaritalStatus)
    : undefined;
  const children =
    Number.isFinite(Number(body.children)) && Number(body.children) >= 0
      ? Math.floor(Number(body.children))
      : undefined;
  const familyNote =
    typeof body.familyNote === "string" ? body.familyNote.trim() || undefined : undefined;

  // 收入来源（多选白名单过滤）与稳定性
  const SOURCES: IncomeSource[] = ["salary", "business", "investment", "parttime", "other"];
  const incomeSources = Array.isArray(body.incomeSources)
    ? (body.incomeSources.filter((s) => SOURCES.includes(s as IncomeSource)) as IncomeSource[])
    : undefined;
  const STABILITY: IncomeStability[] = ["stable", "medium", "volatile"];
  const incomeStability = STABILITY.includes(body.incomeStability as IncomeStability)
    ? (body.incomeStability as IncomeStability)
    : undefined;

  // 关键：未填写 = 0（未设定），绝不按收入比例伪造支出 / 投资
  const expense = Math.max(Number(body.expense) || 0, 0);
  const investment = Math.max(Number(body.investment) || 0, 0);

  const liab = (body.liabilities as Record<string, unknown> | undefined) ?? {};
  const goals = (body.goals as Record<string, unknown> | undefined) ?? {};
  const GOAL_TYPES: WealthGoalType[] = [
    "retirement",
    "wealth_growth",
    "house",
    "education",
    "risk_control",
  ];
  const goalType = GOAL_TYPES.includes(goals.type as WealthGoalType)
    ? (goals.type as WealthGoalType)
    : undefined;

  const wealth: WealthProfile = {
    id: `wp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    userId: sessionUserId,
    name,
    age,
    occupation,
    city,
    maritalStatus,
    children,
    familyNote,
    income,
    incomeSources,
    incomeStability,
    expense,
    investment,
    assets: {
      cash: Number(assets.cash) || 0,
      deposits: Number(assets.deposits) || 0,
      stocks: Number(assets.stocks) || 0,
      funds: Number(assets.funds) || 0,
      bonds: Number(assets.bonds) || 0,
      realEstate: Number(assets.realEstate) || 0,
      other: Number(assets.other) || 0,
    },
    liabilities: {
      mortgage: Number(liab.mortgage) || 0,
      carLoan: Number(liab.carLoan) || 0,
      creditLoan: Number(liab.creditLoan) || 0,
      loans: Number(liab.loans) || 0,
      other: Number(liab.other) || 0,
    },
    goals: {
      // 0 = 用户未设定，前端展示「未设定」，绝不默认 60 岁 / 800 万
      type: goalType,
      retirementAge: Math.max(Number(goals.retirementAge) || 0, 0),
      targetAmount: Math.max(Number(goals.targetAmount) || 0, 0),
      targetYears: Math.max(Number(goals.targetYears) || 0, 0) || undefined,
      lifeGoal: typeof goals.lifeGoal === "string" ? goals.lifeGoal.trim() : "",
    },
    completed: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  // 1) 写入 wealth 画像（financial_profiles）
  wealthProfileManager.create(wealth);
  // 2) 映射并写入计算用 FinancialProfile（供 Twin / Dashboard）
  const profile = toFinancialProfile(wealth);
  profileManager.saveProfile(sessionUserId, profile);
  // 3) 标记账户财富初始化完成
  userAccountStore.updateProfileCompleted(sessionUserId, true);
  // 4) 若用户填写了姓名，同步到账户显示名（避免展示「新用户」）
  if (name) {
    userAccountStore.updateName(sessionUserId, name);
  }

  const twin = computeTwin(profile, { events: [] });
  const alerts = generateAdvisorAlerts(profile, twin);

  return NextResponse.json({
    userId: sessionUserId,
    profile,
    twin,
    alerts,
    wealthProfile: wealth,
  });
}

/**
 * PATCH /api/profile/wealth —— 修改财富画像（Phase 6.5 三 / 五）。
 *
 * 仅做部分更新（资产 / 负债 / 收入 / 支出 / 目标）。更新后：
 *   1) 重新计算 FinancialProfile 镜像并落盘；
 *   2) FinancialChangeDetector 比对前后画像，生成 changeScore；
 *   3) 失效该用户全部 AI 分析缓存（数据已变，旧缓存不可信）；
 *   4) changeScore=high → 后台（优先级 2）触发重新分析，写回新缓存。
 */
const ASSET_FIELDS = ["cash", "deposits", "stocks", "funds", "bonds", "realEstate", "other"];
const LIAB_FIELDS = ["mortgage", "carLoan", "creditLoan", "loans", "other"];
const GOAL_FIELDS = ["type", "retirementAge", "targetAmount", "targetYears", "lifeGoal"];

function mergeNum<T>(prev: T, incoming: Record<string, unknown> | undefined, fields: string[]): T {
  const out = { ...(prev as Record<string, unknown>) } as Record<string, unknown>;
  if (incoming && typeof incoming === "object") {
    for (const f of fields) {
      if (incoming[f] != null) out[f] = Math.max(Number(incoming[f]) || 0, 0);
    }
  }
  return out as T;
}

export async function PATCH(req: NextRequest) {
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  const prevWealth = wealthProfileManager.get(sessionUserId);
  if (!prevWealth) {
    return NextResponse.json({ error: "尚未创建财富画像，无法修改" }, { status: 404 });
  }

  const updates: Partial<WealthProfile> = {};
  if (body.income != null) updates.income = Math.max(Number(body.income) || 0, 0);
  if (body.expense != null) updates.expense = Math.max(Number(body.expense) || 0, 0);
  if (body.investment != null) updates.investment = Math.max(Number(body.investment) || 0, 0);
  if (body.assets && typeof body.assets === "object") {
    updates.assets = mergeNum(prevWealth.assets, body.assets as Record<string, unknown>, ASSET_FIELDS);
  }
  if (body.liabilities && typeof body.liabilities === "object") {
    updates.liabilities = mergeNum(prevWealth.liabilities, body.liabilities as Record<string, unknown>, LIAB_FIELDS);
  }
  if (body.goals && typeof body.goals === "object") {
    const g = body.goals as Record<string, unknown>;
    const prevGoals = (prevWealth.goals as unknown as Record<string, unknown>) || {};
    const out: Record<string, unknown> = { ...prevGoals };
    for (const f of GOAL_FIELDS) {
      if (g[f] != null) {
        // type / lifeGoal 为字符串字段，其余为数值字段
        out[f] = f === "type" || f === "lifeGoal" ? String(g[f]) : Math.max(Number(g[f]) || 0, 0);
      }
    }
    updates.goals = out as unknown as WealthProfile["goals"];
  }

  const updatedWealth = wealthProfileManager.update(sessionUserId, updates);
  if (!updatedWealth) {
    return NextResponse.json({ error: "画像更新失败" }, { status: 500 });
  }

  const prevFinancial = toFinancialProfile(prevWealth);
  const newFinancial = toFinancialProfile(updatedWealth);
  profileManager.saveProfile(sessionUserId, newFinancial);

  const report = detectChanges(prevFinancial, newFinancial);

  // 数据已变：失效旧缓存，避免展示过期结果
  await invalidateUser(sessionUserId);

  let triggeredReanalysis = false;
  if (report.changeScore === "high") {
    triggeredReanalysis = true;
    // 优先级 2：后台重新分析（不阻塞用户请求）
    scheduler.enqueue({
      id: `reanalyze-${sessionUserId}-${Date.now().toString(36)}`,
      priority: 2,
      userId: sessionUserId,
      label: "数据重大变化触发的后台重新分析",
      run: async () => {
        try {
          await orchestrate({
            type: "cfo_summary",
            question: "数据变化后台重新分析",
            profile: newFinancial,
            userId: sessionUserId,
            agents: ["cashflow", "investment", "risk", "retirement"],
            force: true,
            lifecycle: "background",
          });
        } catch {
          /* 失败由 orchestrate 内部降级处理，不阻断 */
        }
      },
    });
  }

  return NextResponse.json({
    ok: true,
    changeScore: report.changeScore,
    changeReport: report,
    triggeredReanalysis,
  });
}

/**
 * GET /api/profile/wealth —— 读取当前用户的财富初始化画像。
 * 不存在返回 404（前端据此判断是否已完成初始化）。
 */
export async function GET() {
  const sessionUserId = await getSessionUserId();
  if (!sessionUserId) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const wealth = wealthProfileManager.get(sessionUserId);
  if (!wealth) {
    return NextResponse.json({ error: "尚未创建财富画像" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, wealthProfile: wealth });
}
