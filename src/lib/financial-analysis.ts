import type { EvidenceFact } from "@/types/enterprise";

export interface FinancialMetric {
  id: string;
  name: string;
  value: number;
  displayValue: string;
  category: "偿债" | "盈利" | "营运" | "现金流" | "结构";
  interpretation: string;
  sourceFactIds: string[];
}

export interface FinancialTrend {
  topic: string;
  fromPeriod: string;
  toPeriod: string;
  changeRate: number;
  sourceFactIds: string[];
}

const MONEY_UNITS: Record<string, number> = { 元: 1, 万元: 10_000, 亿元: 100_000_000 };

function normalized(fact: EvidenceFact): number {
  return fact.value * (MONEY_UNITS[fact.unit] ?? 1);
}

function matches(topic: string, names: string[]): boolean {
  const value = topic.replace(/\s+/g, "").toLowerCase();
  return names.some((name) => value.includes(name.toLowerCase()));
}

function findFact(facts: EvidenceFact[], names: string[]): EvidenceFact | undefined {
  return facts.find((fact) => fact.reviewStatus !== "已驳回" && matches(fact.topic, names));
}

function ratioMetric(input: {
  id: string;
  name: string;
  category: FinancialMetric["category"];
  numerator?: EvidenceFact;
  denominator?: EvidenceFact;
  percent?: boolean;
  explain: (value: number) => string;
}): FinancialMetric | null {
  if (!input.numerator || !input.denominator) return null;
  const denominator = normalized(input.denominator);
  if (!Number.isFinite(denominator) || denominator === 0) return null;
  const raw = normalized(input.numerator) / denominator;
  const value = input.percent ? raw * 100 : raw;
  return {
    id: input.id,
    name: input.name,
    value,
    displayValue: input.percent ? `${value.toFixed(1)}%` : value.toFixed(2),
    category: input.category,
    interpretation: input.explain(value),
    sourceFactIds: [input.numerator.id, input.denominator.id],
  };
}

/**
 * 只对已提供且未被驳回的事实做确定性计算；缺科目就不出指标。
 * 这些阈值仅用于解释，不替代行业规则或授信政策。
 */
export function calculateFinancialMetrics(facts: EvidenceFact[]): FinancialMetric[] {
  const currentAssets = findFact(facts, ["流动资产"]);
  const currentLiabilities = findFact(facts, ["流动负债"]);
  const totalAssets = findFact(facts, ["资产总计", "总资产"]);
  const totalLiabilities = findFact(facts, ["负债合计", "总负债"]);
  const revenue = findFact(facts, ["营业收入", "主营业务收入"]);
  const averageReceivables = findFact(facts, ["平均应收账款"]);
  const netProfit = findFact(facts, ["净利润"]);
  const operatingCashFlow = findFact(facts, ["经营活动产生的现金流量净额", "经营现金流"]);

  return [
    ratioMetric({ id: "current-ratio", name: "流动比率", category: "偿债", numerator: currentAssets, denominator: currentLiabilities, explain: (value) => value < 1 ? "流动资产低于流动负债，需结合回款和短债结构复核" : "短期偿债覆盖为正，仍需结合行业与资产质量判断" }),
    ratioMetric({ id: "debt-ratio", name: "资产负债率", category: "结构", numerator: totalLiabilities, denominator: totalAssets, percent: true, explain: (value) => value > 70 ? "负债占比较高，需复核债务期限与偿付来源" : "负债占比未触发通用高位提示，仍以适用规则为准" }),
    ratioMetric({ id: "net-margin", name: "净利率", category: "盈利", numerator: netProfit, denominator: revenue, percent: true, explain: (value) => value < 0 ? "净利润为负，需核验亏损原因和持续性" : "反映收入转化为净利润的水平，需结合多期趋势" }),
    ratioMetric({ id: "receivables-turnover", name: "应收账款周转率", category: "营运", numerator: revenue, denominator: averageReceivables, explain: (value) => value < 2 ? "应收账款周转偏慢，需结合账龄、客户集中度和信用政策复核" : "反映营业收入对平均应收账款的周转水平，仍需结合行业周期" }),
    ratioMetric({ id: "cash-debt-cover", name: "经营现金流/流动负债", category: "现金流", numerator: operatingCashFlow, denominator: currentLiabilities, percent: true, explain: (value) => value < 20 ? "经营现金流对短期负债覆盖偏弱，需核验资金缺口" : "经营现金流形成一定短债覆盖，仍需结合到期分布" }),
  ].filter((item): item is FinancialMetric => Boolean(item));
}

export function calculateFinancialTrends(facts: EvidenceFact[]): FinancialTrend[] {
  const groups = new Map<string, EvidenceFact[]>();
  for (const fact of facts) {
    if (!fact.period || fact.reviewStatus === "已驳回") continue;
    const group = groups.get(fact.topic) ?? [];
    group.push(fact);
    groups.set(fact.topic, group);
  }
  const trends: FinancialTrend[] = [];
  for (const [topic, items] of groups) {
    const ordered = [...items].sort((a, b) => String(a.period).localeCompare(String(b.period)));
    if (ordered.length < 2) continue;
    const previous = ordered[ordered.length - 2];
    const latest = ordered[ordered.length - 1];
    const base = normalized(previous);
    if (!base) continue;
    trends.push({
      topic,
      fromPeriod: previous.period!,
      toPeriod: latest.period!,
      changeRate: ((normalized(latest) - base) / Math.abs(base)) * 100,
      sourceFactIds: [previous.id, latest.id],
    });
  }
  return trends;
}
