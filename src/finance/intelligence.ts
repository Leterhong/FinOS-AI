import "server-only";

/**
 * AI 投资分析流程（Phase 6.9 需求六 / 八 / 十 / 十三 / 十五）。
 *
 * 流程：用户资产 → Portfolio Engine → Market Data → Risk Agent
 *       → Investment Agent（本地综合） → AI CFO（可选 LLM 解读）→ 生成分析。
 *
 * 成本控制（需求十三，沿用 Phase 6.5/6.8 口径）：
 *  - 行情更新 / 组合计算 / 风险判断 / 趋势分类：纯代码，零 LLM。
 *  - 仅「解释 / 策略分析」这一步可选调用 LLM，且必须同时满足：
 *      有风险信号或用户主动请求解读 + checkBudget().allowed + 已配置模型；
 *    否则降级本地模板（narrative.tier = "local"）。
 *
 * 合规（需求十五）：LLM System Prompt 禁止推荐买卖 / 承诺收益；
 * 所有输出统一附带 INVESTMENT_DISCLAIMER。
 */

import type { FinancialProfile } from "@/data/types";
import { checkBudget } from "@/ai/orchestration/cost-manager";
import { getActiveModelSummary } from "@/ai/model-center/models/resolver";
import { aiService } from "@/ai/gateway/AIService";
import type { InvestmentIntelligenceResult } from "./types";
import { INVESTMENT_DISCLAIMER } from "./types";
import { buildPortfolioView, analyzePortfolio } from "./portfolio";
import { getMarketOverview } from "./market";
import { assessInvestmentRisk, pushRiskNotifications } from "./risk";

const CFO_SYSTEM = [
  "你是 FinOS AI 的 AI CFO 投资分析师。基于给定的真实投资组合数据、市场环境与风险信号，用中文生成一段简洁的投资分析解读（250 字以内）。",
  "硬性约束：",
  "1. 只做信息分析与风险提示，绝不直接推荐买入或卖出任何具体标的；",
  "2. 不承诺任何收益，不给出确定性投资建议，不使用「必涨」「稳赚」等词；",
  "3. 分析必须引用给定数据（占比、收益率、风险信号），不得编造数据；",
  `4. 结尾固定加上一句：「${INVESTMENT_DISCLAIMER}」`,
].join("\n");

/** 本地模板解读（零 LLM 降级路径） */
function localNarrative(result: Omit<InvestmentIntelligenceResult, "narrative" | "aiCalls">): string {
  const { portfolio, analysis, risk, market } = result;
  if (!portfolio.hasInvestments) {
    return `暂无投资数据。添加股票或基金持仓后，AI CFO 将结合真实行情为你分析组合健康度与风险。${INVESTMENT_DISCLAIMER}`;
  }
  const lines: string[] = [];
  lines.push(
    `你的投资组合当前市值 ¥${portfolio.totalValue.toLocaleString()}${
      portfolio.totalReturnRate != null
        ? `，累计收益率 ${(portfolio.totalReturnRate * 100).toFixed(2)}%`
        : ""
    }${
      portfolio.todayChangePct != null
        ? `，今日${portfolio.todayChangePct >= 0 ? "上涨" : "下跌"} ${Math.abs(portfolio.todayChangePct).toFixed(2)}%`
        : ""
    }。`,
  );
  if (analysis) {
    lines.push(
      `投资健康评分 ${analysis.healthScore} 分；最大单一持仓「${analysis.topPositionName ?? "—"}」占比 ${(analysis.topPositionWeight * 100).toFixed(1)}%，股票类占比 ${(analysis.stockShare * 100).toFixed(1)}%。`,
    );
  }
  if (risk && risk.alerts.length > 0) {
    lines.push(`风险提示：${risk.alerts.map((a) => a.title).join("；")}。`);
  } else if (risk) {
    lines.push(risk.summary);
  }
  if (market.indices.length > 0) {
    lines.push(`市场环境：${market.trendNote}`);
  }
  lines.push(INVESTMENT_DISCLAIMER);
  return lines.join("\n");
}

/**
 * 运行完整投资智能分析流水线。
 * @param opts.wantAI 用户主动请求 AI 解读（页面按钮触发）
 * @param opts.pushAlerts 是否将风险写入通知中心（默认 true）
 */
export async function runInvestmentIntelligence(
  userId: string,
  profile: FinancialProfile,
  opts: { wantAI?: boolean; pushAlerts?: boolean } = {},
): Promise<InvestmentIntelligenceResult> {
  // ① Portfolio Engine（真实行情 + 组合计算，零 LLM）
  const portfolio = await buildPortfolioView(userId);
  // ② Market Data / Market Agent（指数 + 趋势，零 LLM）
  const market = await getMarketOverview(userId);
  // ③ Portfolio Intelligence Agent（本地分析）
  const analysis = analyzePortfolio(portfolio);
  // ④ Risk Agent（结合用户风险等级 + 市场 + 组合）
  const risk = assessInvestmentRisk({ profile, view: portfolio, analysis, market });

  // 风险 → 通知中心（验收测试 3：股票大跌 → Risk Agent 提醒）
  if (opts.pushAlerts !== false && risk) {
    try {
      pushRiskNotifications(userId, risk);
    } catch {
      /* 通知失败不阻塞分析 */
    }
  }

  const base = {
    portfolio,
    analysis,
    risk,
    market,
    disclaimer: INVESTMENT_DISCLAIMER,
    generatedAt: new Date().toISOString(),
  };

  // ⑤ AI CFO 解读：仅在「有风险信号或用户主动请求」且预算/模型允许时调 LLM
  const hasSignal = (risk?.alerts.length ?? 0) > 0;
  const shouldTryAI = portfolio.hasInvestments && (opts.wantAI === true || hasSignal);

  if (shouldTryAI) {
    try {
      const [budget, model] = await Promise.all([
        checkBudget(userId),
        getActiveModelSummary(userId),
      ]);
      if (budget.allowed && model.configured) {
        const prompt = [
          `【投资组合】总市值 ¥${portfolio.totalValue.toLocaleString()}，持仓 ${portfolio.positions.length} 个：`,
          ...portfolio.positions.map(
            (p) =>
              `- ${p.name}（${p.type === "stock" ? "股票" : "基金"}）市值 ¥${p.marketValue.toLocaleString()}，占比 ${(p.weight * 100).toFixed(1)}%${
                p.returnRate != null ? `，收益率 ${(p.returnRate * 100).toFixed(1)}%` : ""
              }${p.todayChangePct != null ? `，今日 ${p.todayChangePct.toFixed(2)}%` : ""}`,
          ),
          analysis
            ? `【组合体检】健康评分 ${analysis.healthScore}，股票占比 ${(analysis.stockShare * 100).toFixed(1)}%，最大持仓占比 ${(analysis.topPositionWeight * 100).toFixed(1)}%。`
            : "",
          risk
            ? `【风险信号】用户风险偏好：${risk.userRiskLabel}；${risk.alerts.length > 0 ? risk.alerts.map((a) => `[${a.severity}] ${a.title}：${a.detail}`).join("\n") : "无显著风险信号"}`
            : "",
          market.indices.length > 0
            ? `【市场环境】${market.indices.map((i) => `${i.name} ${i.value}（${i.changePct != null ? `${i.changePct >= 0 ? "+" : ""}${i.changePct.toFixed(2)}%` : "—"}）`).join("；")}。${market.trendNote}`
            : "",
          "请生成投资分析解读。",
        ]
          .filter(Boolean)
          .join("\n");

        const text = await aiService.quickGenerate(CFO_SYSTEM, prompt, {
          taskType: "analysis",
          userId,
          agentName: "AI CFO 投资分析",
          maxTokens: 800,
          temperature: 0.4,
        });
        if (text.trim()) {
          return {
            ...base,
            narrative: { tier: "ai", text: text.trim(), model: model.modelName },
            aiCalls: 1,
          };
        }
      }
      // 预算 / 模型不满足 → 降级
      return {
        ...base,
        narrative: {
          tier: "local",
          text: localNarrative(base),
          reason: !budget.allowed ? budget.reason ?? "AI 预算已达上限" : "尚未连接 AI 模型",
        },
        aiCalls: 0,
      };
    } catch (e) {
      return {
        ...base,
        narrative: {
          tier: "local",
          text: localNarrative(base),
          reason: `AI 解读失败已降级：${(e as Error).message}`,
        },
        aiCalls: 0,
      };
    }
  }

  // 无风险信号且未主动请求 → 本地模板（零成本）
  return {
    ...base,
    narrative: { tier: "local", text: localNarrative(base) },
    aiCalls: 0,
  };
}
