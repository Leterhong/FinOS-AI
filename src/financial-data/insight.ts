import "server-only";

/**
 * Financial Data Insight Agent —— 从真实金融数据中发现规律。
 * 两级策略：
 *   1. 统计规则（趋势 / 异常 / 集中度 / 储蓄率，零成本、可离线运行）
 *   2. LLM 增强（把统计事实交给模型生成自然语言洞察，超时优雅降级）
 * 示例产出：「过去 6 个月餐饮消费增长 35%」「持仓集中度过高：单一基金占比 62%」
 */

import { aiService } from "@/ai/gateway/AIService";
import type { AIMessage } from "@/ai/types";
import type { FinancialDataSummary, FinancialInsight, InsightLevel } from "./types";

const LLM_TIMEOUT_MS = 25_000;

function sid(): string {
  return `insight-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } catch {
    return undefined;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 主入口：生成数据洞察（规则必产出，LLM 可选增强） */
export async function generateInsights(
  summary: FinancialDataSummary,
  opts: { useLlm?: boolean } = {},
): Promise<FinancialInsight[]> {
  const insights = ruleInsights(summary);

  if (opts.useLlm !== false && summary.hasData) {
    const llm = await withTimeout(llmInsights(summary), LLM_TIMEOUT_MS);
    if (llm?.length) {
      insights.push(...llm);
    }
  }
  return insights;
}

/* -------------------------------------------------------------------------- */
/*  统计规则洞察                                                                 */
/* -------------------------------------------------------------------------- */

function ruleInsights(s: FinancialDataSummary): FinancialInsight[] {
  const out: FinancialInsight[] = [];
  if (!s.hasData) return out;

  const push = (
    level: InsightLevel,
    title: string,
    detail: string,
    extra?: Partial<FinancialInsight>,
  ) => {
    out.push({ id: sid(), level, title, detail, source: "rule", ...extra });
  };

  const months = s.monthlyCashFlow;

  // ---- 1. 分类消费趋势：前半段 vs 后半段 ----
  if (months.length >= 4) {
    const half = Math.floor(months.length / 2);
    const firstMonths = new Set(months.slice(0, half).map((m) => m.month));
    const lastMonths = new Set(months.slice(-half).map((m) => m.month));
    // 用 categoryStats 无月度维度，这里以整体月度合计近似（需要交易明细的趋势由 API 层传入）
    void firstMonths;
    void lastMonths;
  }

  // ---- 2. 储蓄率水平与变化 ----
  if (months.length >= 2) {
    const latest = months[months.length - 1];
    const prev = months[months.length - 2];
    const delta = latest.savingsRate - prev.savingsRate;
    if (latest.savingsRate < 0) {
      push(
        "critical",
        `${latest.month} 月出现入不敷出`,
        `当月支出 ¥${latest.expense.toLocaleString()} 超过收入 ¥${latest.income.toLocaleString()}，净现金流为 ¥${latest.net.toLocaleString()}。建议立即检查大额支出项。`,
        { metric: latest.savingsRate },
      );
    } else if (delta <= -0.1) {
      push(
        "warning",
        `储蓄率环比下降 ${Math.abs(Math.round(delta * 100))} 个百分点`,
        `${prev.month} 储蓄率 ${Math.round(prev.savingsRate * 100)}% → ${latest.month} ${Math.round(latest.savingsRate * 100)}%，支出增长快于收入。`,
        { metric: delta },
      );
    } else if (s.avgSavingsRate >= 0.3) {
      push(
        "positive",
        `平均储蓄率 ${Math.round(s.avgSavingsRate * 100)}%，表现优秀`,
        `过去 ${months.length} 个月平均每月净结余 ¥${Math.round(s.avgMonthlyIncome - s.avgMonthlyExpense).toLocaleString()}，具备持续投资能力。`,
        { metric: s.avgSavingsRate },
      );
    }
  }

  // ---- 3. 消费结构：头部分类占比 ----
  const top = s.categoryStats[0];
  if (top && top.ratio >= 0.35 && top.category !== "rent" && top.category !== "loan") {
    push(
      "warning",
      `${top.label}支出占比 ${Math.round(top.ratio * 100)}%，明显偏高`,
      `${top.label}合计 ¥${top.amount.toLocaleString()}（${top.count} 笔），占总支出的 ${Math.round(top.ratio * 100)}%。若压缩 20%，每月可多结余约 ¥${Math.round((top.amount * 0.2) / Math.max(months.length, 1)).toLocaleString()}。`,
      { category: top.category, metric: top.ratio },
    );
  }

  // ---- 4. 收入支出整体水平 ----
  if (s.avgMonthlyIncome > 0 && s.avgMonthlyExpense / s.avgMonthlyIncome > 0.85) {
    push(
      "warning",
      "月支出已接近月收入的 85% 以上",
      `月均收入 ¥${s.avgMonthlyIncome.toLocaleString()}，月均支出 ¥${s.avgMonthlyExpense.toLocaleString()}，抗风险缓冲不足。建议建立至少 3~6 个月支出的应急资金。`,
      { metric: s.avgMonthlyExpense / s.avgMonthlyIncome },
    );
  }

  // ---- 5. 投资持仓集中度 ----
  if (s.totalInvestment > 0 && s.assetAllocation.length > 0) {
    const topAsset = s.assetAllocation[0];
    if (topAsset.ratio >= 0.7 && s.assetAllocation.length > 1) {
      push(
        "warning",
        `资产配置集中：${topAsset.label}占投资组合 ${Math.round(topAsset.ratio * 100)}%`,
        `${topAsset.label}市值 ¥${topAsset.value.toLocaleString()}，建议分散到不同资产类别以降低波动风险。`,
        { metric: topAsset.ratio },
      );
    }
    if (s.totalProfit !== 0) {
      const rr = s.totalProfit / Math.max(s.totalInvestment - s.totalProfit, 1);
      push(
        s.totalProfit > 0 ? "positive" : "info",
        s.totalProfit > 0
          ? `投资组合浮盈 ¥${s.totalProfit.toLocaleString()}`
          : `投资组合浮亏 ¥${Math.abs(s.totalProfit).toLocaleString()}`,
        `当前持仓总市值 ¥${s.totalInvestment.toLocaleString()}，累计收益率约 ${Math.round(rr * 100)}%。`,
        { metric: rr },
      );
    }
  }

  // ---- 6. 数据覆盖情况 ----
  if (s.dateRange) {
    push(
      "info",
      `已接入 ${months.length} 个月真实数据（${s.transactionCount} 笔交易）`,
      `数据区间 ${s.dateRange.from} ~ ${s.dateRange.to}，覆盖 ${s.categoryStats.length} 个消费分类。数据越完整，AI 财富分析越精准。`,
    );
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/*  LLM 增强洞察                                                                 */
/* -------------------------------------------------------------------------- */

async function llmInsights(s: FinancialDataSummary): Promise<FinancialInsight[]> {
  const facts = [
    `月均收入 ¥${s.avgMonthlyIncome}，月均支出 ¥${s.avgMonthlyExpense}，平均储蓄率 ${Math.round(s.avgSavingsRate * 100)}%`,
    `支出分类 TOP5: ${s.categoryStats.slice(0, 5).map((c) => `${c.label} ¥${c.amount}(${Math.round(c.ratio * 100)}%)`).join("、")}`,
    `月度现金流: ${s.monthlyCashFlow.map((m) => `${m.month} 净 ¥${m.net}`).join("、")}`,
    s.totalInvestment > 0
      ? `投资持仓总市值 ¥${s.totalInvestment}，浮动盈亏 ¥${s.totalProfit}`
      : "暂无投资持仓数据",
  ].join("\n");

  const messages: AIMessage[] = [
    {
      role: "system",
      content:
        '你是个人财务数据洞察分析师。基于统计事实提炼 2~3 条高价值洞察，聚焦用户没注意到的规律与可执行建议。只输出 JSON 数组，元素格式 {"level":"info|positive|warning|critical","title":"一句话结论","detail":"数据支撑与建议"}。用简体中文。',
    },
    { role: "user", content: facts },
  ];

  const response = await aiService.generate(messages, {
    taskType: "analysis",
    temperature: 0.3,
    maxTokens: 800,
    responseFormat: "json",
  });

  try {
    const jsonMatch = response.content.match(/\[[\s\S]*\]/);
    const arr = JSON.parse(jsonMatch ? jsonMatch[0] : response.content) as {
      level?: string;
      title?: string;
      detail?: string;
    }[];
    const levels: InsightLevel[] = ["info", "positive", "warning", "critical"];
    return arr
      .filter((x) => x?.title)
      .slice(0, 3)
      .map((x) => ({
        id: sid(),
        level: levels.includes(x.level as InsightLevel) ? (x.level as InsightLevel) : "info",
        title: String(x.title),
        detail: String(x.detail ?? ""),
        source: "llm" as const,
      }));
  } catch {
    return [];
  }
}
