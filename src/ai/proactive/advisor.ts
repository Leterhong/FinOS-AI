import "server-only";

/**
 * Phase 6.8 分级 Proactive Advisor（需求三 / 八 / 十三）。
 *
 * 分级规则（成本控制核心）：
 *  - 无事件           → 不生成建议、不调 LLM（验收测试 3）；
 *  - 仅 info 级事件   → local：纯代码模板，不调 LLM；
 *  - 最高 warn 级     → light：轻量模型（taskType=summarization）；
 *  - 存在 critical 级 → full：深度模型（taskType=analysis）。
 *
 * LLM 调用前置校验：checkBudget 预算允许 + 已配置可用模型；
 * 任一不满足或调用失败 → 优雅降级为本地模板（绝不 500、绝不伪造 AI 输出）。
 *
 * 个性化（需求八）：调 LLM 时注入长期记忆（用户目标 / 历史决策 / 风险偏好），
 * 本地模板也必须引用退休目标与风险偏好，禁止泛化建议（验收测试 5）。
 */

import type { FinancialProfile } from "@/data/types";
import type { TwinSnapshot } from "@/twin/engine";
import type { AlertSeverity, FinancialAlert } from "@/ai/monitoring/types";
import { checkBudget } from "@/ai/orchestration/cost-manager";
import { getActiveModelSummary } from "@/ai/model-center/models/resolver";
import { aiService } from "@/ai/gateway/AIService";
import { buildMemoryContext, buildPersonalProfile } from "@/memory";
import type { AdviceTier, ProactiveAdvice } from "./types";

const RISK_LABEL: Record<FinancialProfile["riskLevel"], string> = {
  conservative: "保守型",
  moderate: "稳健型",
  aggressive: "进取型",
};

function sevRank(s: AlertSeverity): number {
  return s === "critical" ? 2 : s === "warn" ? 1 : 0;
}

/** 按事件严重度决定建议生成层级。 */
export function tierOf(alerts: FinancialAlert[]): AdviceTier {
  const max = alerts.reduce((m, a) => Math.max(m, sevRank(a.severity)), 0);
  if (max >= 2) return "full";
  if (max >= 1) return "light";
  return "local";
}

/** 本地建议模板：必须结合退休目标与风险偏好（验收测试 5，禁止泛化）。 */
export function localAdvice(
  profile: FinancialProfile,
  twin: TwinSnapshot,
  alerts: FinancialAlert[]
): string {
  const lines: string[] = [];
  const risk = RISK_LABEL[profile.riskLevel] ?? profile.riskLevel;
  const goal = profile.goal;

  if (alerts.length === 0) {
    lines.push(
      `本期体检未发现异常。当前财富健康分 ${twin.health.total}，净资产 ¥${twin.netWorth.toLocaleString()}。`
    );
  } else {
    const top = [...alerts]
      .sort((a, b) => sevRank(b.severity) - sevRank(a.severity))
      .slice(0, 3);
    lines.push(`本期发现 ${alerts.length} 项需要关注的变化：`);
    for (const a of top) {
      lines.push(`• ${a.title}：${a.message}`);
    }
  }

  // 结合退休目标（长期记忆 / 画像目标）
  if (goal.retirementAge > 0) {
    if (twin.onTrack) {
      lines.push(
        `你的 ${goal.retirementAge} 岁退休目标（¥${goal.targetAmount.toLocaleString()}）目前在轨，预计 ${twin.projectedRetireAge} 岁可达成，请保持当前储蓄与投资节奏。`
      );
    } else {
      lines.push(
        `注意：按当前轨迹，你的 ${goal.retirementAge} 岁退休目标预计将推迟至 ${twin.projectedRetireAge} 岁。结合上述变化，优先修复现金流后再评估提升月投资额。`
      );
    }
  }

  // 结合风险偏好
  lines.push(
    `以上建议基于你的${risk}风险偏好给出；任何加仓 / 调仓动作请控制在与${risk}定位匹配的波动范围内。`
  );

  return lines.join("\n");
}

/** LLM 系统提示。 */
const ADVISOR_SYSTEM = `你是 FinOS AI 的 AI CFO（主动财富管家）。系统主动监控发现了用户财富状态的异常事件，请基于给出的真实数据生成简短、可执行的中文建议。
规则：
1. 只依据提供的事件与画像数据，绝不虚构任何数字。
2. 必须结合用户的长期目标（如退休目标）与风险偏好，禁止泛化的通用建议。
3. 输出 3-5 条建议，每条一行，以「•」开头，先讲最紧急的。
4. 语气专业、冷静，像一位私人 CFO，不使用夸张营销话术。`;

export interface AdviceOutcome {
  advice: ProactiveAdvice | null;
  /** 实际 LLM 调用次数（0 或 1）。 */
  aiCalls: number;
  /** 是否因预算超限而降级。 */
  budgetBlocked: boolean;
}

/**
 * 生成主动建议（分级 + 预算 + 记忆个性化 + 优雅降级）。
 */
export async function generateProactiveAdvice(
  userId: string,
  profile: FinancialProfile,
  twin: TwinSnapshot,
  alerts: FinancialAlert[]
): Promise<AdviceOutcome> {
  // 验收测试 3：无事件 → 不生成建议、不调 LLM
  if (alerts.length === 0) {
    return { advice: null, aiCalls: 0, budgetBlocked: false };
  }

  const tier = tierOf(alerts);
  const now = Date.now();

  // 仅 info 级 → 本地模板
  if (tier === "local") {
    return {
      advice: {
        tier,
        text: localAdvice(profile, twin, alerts),
        usedLLM: false,
        personalized: true,
        generatedAt: now,
      },
      aiCalls: 0,
      budgetBlocked: false,
    };
  }

  // warn / critical → 尝试 LLM，前置校验预算与模型
  let degradeReason: string | undefined;
  let budgetBlocked = false;

  try {
    const [budget, model] = await Promise.all([
      checkBudget(userId),
      getActiveModelSummary(userId),
    ]);
    if (!budget.allowed) {
      budgetBlocked = true;
      degradeReason = budget.reason ?? "AI 预算已达上限";
    } else if (!model.configured) {
      degradeReason = "尚未连接 AI 模型";
    }
  } catch {
    degradeReason = "预算 / 模型状态检查失败";
  }

  if (!degradeReason) {
    try {
      const [personalProfile, memoryCtx] = await Promise.all([
        buildPersonalProfile(userId),
        buildMemoryContext(
          userId,
          alerts.map((a) => a.title).join("、")
        ),
      ]);
      const memoryBlock = [personalProfile, memoryCtx]
        .filter(Boolean)
        .join("\n\n");

      const eventLines = alerts
        .map(
          (a) =>
            `- [${a.severity}] ${a.title}：${a.message}${
              a.changePct != null
                ? `（变化 ${(a.changePct * 100).toFixed(1)}%）`
                : ""
            }`
        )
        .join("\n");

      const userPrompt = [
        memoryBlock ? `【用户长期记忆】\n${memoryBlock}` : "",
        `【用户画像】年龄 ${profile.age}，月收入 ¥${profile.monthlySalary.toLocaleString()}，月支出 ¥${profile.monthlyExpenses.toLocaleString()}，净资产 ¥${twin.netWorth.toLocaleString()}，风险偏好：${RISK_LABEL[profile.riskLevel]}，目标：${profile.goal.retirementAge} 岁退休（¥${profile.goal.targetAmount.toLocaleString()}），当前${twin.onTrack ? "在轨" : `预计推迟至 ${twin.projectedRetireAge} 岁`}。`,
        `【监控发现的事件】\n${eventLines}`,
        "请生成主动建议。",
      ]
        .filter(Boolean)
        .join("\n\n");

      const text = await aiService.quickGenerate(ADVISOR_SYSTEM, userPrompt, {
        taskType: tier === "full" ? "analysis" : "summarization",
        userId,
        agentName: "AI CFO 主动管家",
        maxTokens: 1024,
        temperature: 0.4,
      });

      if (text.trim()) {
        return {
          advice: {
            tier,
            text: text.trim(),
            usedLLM: true,
            personalized: true,
            generatedAt: now,
          },
          aiCalls: 1,
          budgetBlocked: false,
        };
      }
      degradeReason = "模型返回空内容";
    } catch (err) {
      degradeReason =
        err instanceof Error ? `AI 调用失败：${err.message}` : "AI 调用失败";
    }
  }

  // 降级：本地模板（带降级原因，前端可提示）
  return {
    advice: {
      tier,
      text: localAdvice(profile, twin, alerts),
      usedLLM: false,
      personalized: true,
      degradeReason,
      generatedAt: now,
    },
    aiCalls: 0,
    budgetBlocked,
  };
}
