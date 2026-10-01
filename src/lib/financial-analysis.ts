import type { EvidenceFact } from "@/types/enterprise";
import { canonicalMetricName, metricTopicMatches } from "@/lib/metric-aliases";
import { toYuan } from "@/lib/units";

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

function normalized(fact: EvidenceFact): number {
  return toYuan(fact.value, fact.unit);
}

function matches(topic: string, names: string[]): boolean {
  return names.some((name) => metricTopicMatches(topic, name));
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
  /** 分母必须为正（如利息保障：财务费用可能为负，负分母无意义）。 */
  positiveDenominator?: boolean;
  explain: (value: number) => string;
}): FinancialMetric | null {
  if (!input.numerator || !input.denominator) return null;
  const denominator = normalized(input.denominator);
  const numerator = normalized(input.numerator);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  if (input.positiveDenominator && denominator <= 0) return null;
  const raw = numerator / denominator;
  const value = input.percent ? raw * 100 : raw;
  if (!Number.isFinite(value)) return null;
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
  // 同期口径：存在期间信息时，只使用最新一期的事实计算比率，避免把不同期间的
  // 分子/分母拼在一起（如流动资产的 2023 年数与流动负债的 2024 年数）。
  const periods = [...new Set(facts.filter((fact) => fact.reviewStatus !== "已驳回" && fact.period).map((fact) => String(fact.period)))].sort();
  const referencePeriod = periods.length ? periods[periods.length - 1] : "";
  const scoped = referencePeriod ? facts.filter((fact) => !fact.period || String(fact.period) === referencePeriod) : facts;
  const currentAssets = findFact(scoped, ["流动资产"]);
  const currentLiabilities = findFact(scoped, ["流动负债"]);
  const totalAssets = findFact(scoped, ["资产总计", "总资产"]);
  const totalLiabilities = findFact(scoped, ["负债合计", "总负债"]);
  const revenue = findFact(scoped, ["营业收入", "主营业务收入"]);
  const averageReceivables = findFact(scoped, ["平均应收账款", "应收账款平均余额"]);
  const netProfit = findFact(scoped, ["净利润"]);
  const operatingCashFlow = findFact(scoped, ["经营活动产生的现金流量净额", "经营现金流"]);
  const cash = findFact(scoped, ["货币资金", "现金及现金等价物"]);
  const averageInventory = findFact(scoped, ["平均存货", "存货平均余额"]);
  const operatingCost = findFact(scoped, ["营业成本", "主营业务成本"]);
  const interestBearingDebt = findFact(scoped, ["有息负债", "计息负债"]);
  // 利息保障优先用「利息费用/利息支出」；缺省时用「财务费用」近似（含汇兑/手续费）。
  const interestExpense = findFact(scoped, ["利息费用", "利息支出", "财务费用"]);

  return [
    ratioMetric({ id: "current-ratio", name: "流动比率", category: "偿债", numerator: currentAssets, denominator: currentLiabilities, explain: (value) => value < 1 ? "流动资产低于流动负债，需结合回款和短债结构复核" : "短期偿债覆盖为正，仍需结合行业与资产质量判断" }),
    ratioMetric({ id: "debt-ratio", name: "资产负债率", category: "结构", numerator: totalLiabilities, denominator: totalAssets, percent: true, explain: (value) => value > 70 ? "负债占比较高，需复核债务期限与偿付来源" : "负债占比未触发通用高位提示，仍以适用规则为准" }),
    ratioMetric({ id: "net-margin", name: "净利率", category: "盈利", numerator: netProfit, denominator: revenue, percent: true, explain: (value) => value < 0 ? "净利润为负，需核验亏损原因和持续性" : "反映收入转化为净利润的水平，需结合多期趋势" }),
    ratioMetric({ id: "receivables-turnover", name: "应收账款周转率", category: "营运", numerator: revenue, denominator: averageReceivables, explain: (value) => value < 2 ? "应收账款周转偏慢，需结合账龄、客户集中度和信用政策复核" : "反映营业收入对平均应收账款的周转水平，仍需结合行业周期" }),
    ratioMetric({ id: "cash-debt-cover", name: "经营现金流/流动负债", category: "现金流", numerator: operatingCashFlow, denominator: currentLiabilities, percent: true, explain: (value) => value < 20 ? "经营现金流对短期负债覆盖偏弱，需核验资金缺口" : "经营现金流形成一定短债覆盖，仍需结合到期分布" }),
    ratioMetric({ id: "cash-ratio", name: "现金比率", category: "偿债", numerator: cash, denominator: currentLiabilities, explain: (value) => value < 0.2 ? "现金类资产对流动负债覆盖偏低，需关注即期偿付能力" : "现金类资产可覆盖部分流动负债，仍需结合受限资金比例" }),
    ratioMetric({ id: "inventory-turnover", name: "存货周转率", category: "营运", numerator: operatingCost, denominator: averageInventory, explain: (value) => value < 2 ? "存货周转偏慢，需结合库龄、跌价准备与销售节奏复核" : "反映营业成本对平均存货的周转水平，仍需结合行业特性" }),
    ratioMetric({ id: "interest-debt-ratio", name: "有息负债率", category: "结构", numerator: interestBearingDebt, denominator: totalAssets, percent: true, explain: (value) => value > 40 ? "有息负债占比较高，需复核融资成本与到期结构" : "有息负债占比未触发通用高位提示，仍以适用规则为准" }),
    ratioMetric({ id: "cashflow-interest-cover", name: "经营现金流利息保障", category: "现金流", numerator: operatingCashFlow, denominator: interestExpense, positiveDenominator: true, explain: (value) => value < 2 ? "经营现金流对利息支出覆盖偏弱，需关注偿付压力" : "经营现金流可覆盖利息支出，仍需结合债务到期结构" }),
  ].filter((item): item is FinancialMetric => Boolean(item));
}

export function calculateFinancialTrends(facts: EvidenceFact[]): FinancialTrend[] {
  // 同义科目归一到统一口径后再分组，避免「营业收入 / 主营业务收入」各自成组而趋势缺失。
  const groups = new Map<string, EvidenceFact[]>();
  for (const fact of facts) {
    if (!fact.period || fact.reviewStatus === "已驳回") continue;
    const key = canonicalMetricName(fact.topic) || fact.topic;
    const group = groups.get(key) ?? [];
    group.push(fact);
    groups.set(key, group);
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
