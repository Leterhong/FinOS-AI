import { NextRequest, NextResponse } from "next/server";
import type { FinancialProfile } from "@/data/types";
import type { AgentAnalysisOutput } from "@/ai/types";
import { computeTwin } from "@/twin/engine";
import { runMonitoring } from "@/ai/monitoring";
import { orchestrate } from "@/ai/orchestration/orchestrator";
import { requireFinancialContext, isNeedProfile } from "@/ai/guard";
import { isEmptyProfile } from "@/data/types";

// 密钥仅在服务端读取，使用 Node.js 运行时。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MonitorBody {
  userId?: unknown;
  profile?: unknown;
  prevProfile?: unknown;
  /** 是否调用 Risk / Investment / Retirement 多智能体深度分析。 */
  runAgents?: unknown;
  /** Phase 5：是否在监控后由 Action Agent 拆出执行任务并写入 Task System。 */
  createTasks?: unknown;
}

/**
 * POST /api/ai/monitor —— AI CFO 主动体检：
 * 监控资产 / 现金流 / 风险 / 目标 / 市场变化，检测异常事件，
 * 生成提醒、目标进度、行动计划与主动简报，并（可选）调度多智能体深度分析。
 */
export async function POST(req: NextRequest) {
  // Phase 5.9：Financial Context Guard —— 必须拥有真实持久化画像
  const ctx = await requireFinancialContext();
  if (isNeedProfile(ctx)) return ctx;

  // Phase 6.7 需求十一：无真实财富数据禁止生成分析（凭空臆造）
  if (isEmptyProfile(ctx.profile)) {
    return NextResponse.json(
      {
        error: "NO_REAL_DATA",
        message: "你的财富数据还未完善，请添加资产信息后开始分析。",
      },
      { status: 403 }
    );
  }

  let body: MonitorBody;
  try {
    body = (await req.json()) as MonitorBody;
  } catch {
    return NextResponse.json({ error: "请求体不是合法 JSON" }, { status: 400 });
  }

  // 主画像一律使用服务端真实画像；prevProfile 仅用于变更检测（可选）
  const profile = ctx.profile;
  const prevProfile = (body.prevProfile as FinancialProfile | undefined) ?? null;
  const prevSnapshot = prevProfile ? computeTwin(prevProfile) : null;
  const runAgents = body.runAgents === true || body.runAgents === "true";
  const createTasks = body.createTasks === true || body.createTasks === "true";

  try {
    // 确定性体检（不调 LLM）；多智能体深度分析改由 Orchestrator 统一调度（缓存 + 预算 + 按需）
    const { monitoring, tasks } = await runMonitoring({
      userId: ctx.userId,
      profile,
      prevProfile,
      prevSnapshot,
      runAgents: false,
      createTasks,
    });

    let agents: AgentAnalysisOutput[] | undefined;
    if (runAgents) {
      try {
        const res = await orchestrate({
          type: "cfo_summary",
          question: "AI CFO 主动体检：综合现金流、投资、风险与退休规划分析",
          profile,
          userId: ctx.userId,
          agents: ["cashflow", "investment", "risk", "retirement"],
          force: true,
          lifecycle: "user",
        });
        agents = res.result;
      } catch {
        agents = undefined;
      }
    }

    return NextResponse.json({ monitoring, agents: agents ?? [], tasks: tasks ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "监控失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
