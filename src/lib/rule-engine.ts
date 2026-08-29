/**
 * 确定性规则评估器（纯函数，无 LLM、无 IO）。
 *
 * 设计目标：把「规则匹配」从 prompt 祈祷变成可测试、可复现、可审计的代码。
 *  - 输入：资料结构化抽取产出的事实（含原文引用）+ 规则条件（结构化 JSON）；
 *  - 输出：每条规则的命中结论、依据引用与人话解释；
 *  - LLM 只负责事实抽取与解释生成，命中判定永远在这里完成。
 */

/** 规则条件：对事实主题 + 比较操作 + 阈值。 */
export interface RuleCondition {
  /** 事实主题，如「货币资金」「资产负债率」。 */
  metric: string;
  op: "lt" | "lte" | "gt" | "gte" | "eq";
  /** 阈值（货币类单位：元）。 */
  value: number;
}

/** 资料抽取产出的事实候选（必须携带原文引用）。 */
export interface FactCandidate {
  topic: string;
  value: number;
  unit: "元" | "万元" | "亿元" | "%";
  quote: string;
  location?: string;
}

export interface RuleOutcome {
  hit: boolean;
  /** 供前端直接展示的解释。 */
  reason: string;
  /** 命中的事实原文引用（Evidence first：没有引用不算命中）。 */
  matchedQuote?: string;
  /** 用于比较的归一化数值（货币归一化到元，百分比保留原值）。 */
  normalizedValue?: number;
}

const UNIT_FACTOR: Record<FactCandidate["unit"], number> = {
  元: 1,
  万元: 10_000,
  亿元: 100_000_000,
  "%": 1,
};

function normalizeFact(fact: FactCandidate): number {
  const base = UNIT_FACTOR[fact.unit] ?? 1;
  return fact.value * base;
}

function compare(actual: number, op: RuleCondition["op"], threshold: number): boolean {
  switch (op) {
    case "lt":
      return actual < threshold;
    case "lte":
      return actual <= threshold;
    case "gt":
      return actual > threshold;
    case "gte":
      return actual >= threshold;
    case "eq":
      return Math.abs(actual - threshold) < 1e-9;
    default:
      return false;
  }
}

const OP_LABEL: Record<RuleCondition["op"], string> = {
  lt: "低于",
  lte: "不高于",
  gt: "高于",
  gte: "不低于",
  eq: "等于",
};

function topicMatches(factTopic: string, metric: string): boolean {
  const a = factTopic.trim().toLowerCase();
  const b = metric.trim().toLowerCase();
  return a.includes(b) || b.includes(a);
}

/**
 * 对一组事实评估一条条件（hitAny 语义：任一匹配主题的事实满足阈值即命中）。
 * 三种结论全部显式：命中 / 有主题但未满足 / 未找到相关事实——绝不编造。
 */
export function evaluateRule(facts: FactCandidate[], condition: RuleCondition): RuleOutcome {
  const candidates = facts.filter(
    (fact) => typeof fact.value === "number" && Number.isFinite(fact.value) && topicMatches(fact.topic, condition.metric)
  );
  if (candidates.length === 0) {
    return {
      hit: false,
      reason: `未找到主题「${condition.metric}」相关的可核验事实，需人工补充资料后再判定`,
    };
  }
  for (const fact of candidates) {
    const normalized = normalizeFact(fact);
    if (compare(normalized, condition.op, condition.value)) {
      return {
        hit: true,
        reason: `「${fact.topic}」为 ${fact.value}${fact.unit}，${OP_LABEL[condition.op]}阈值 ${condition.value}，命中`,
        matchedQuote: fact.quote,
        normalizedValue: normalized,
      };
    }
  }
  const values = candidates.map((fact) => `${fact.value}${fact.unit}`).join("、");
  return {
    hit: false,
    reason: `「${condition.metric}」现有值（${values}）均${OP_LABEL[condition.op]}阈值 ${condition.value} 的条件不成立，未命中`,
    normalizedValue: normalizeFact(candidates[0]),
  };
}

export interface StructuredRule {
  code: string;
  name: string;
  domain?: string;
  conditions: RuleCondition[];
}

export interface RuleHit {
  code: string;
  name: string;
  hit: boolean;
  reason: string;
  matchedQuote?: string;
}

/** 批量评估：一条规则的全部条件同时满足才算命中（AND 语义）。 */
export function evaluateRules(facts: FactCandidate[], rules: StructuredRule[]): RuleHit[] {
  return rules
    .filter((rule) => Array.isArray(rule.conditions) && rule.conditions.length > 0)
    .map((rule) => {
      const outcomes = rule.conditions.map((condition) => evaluateRule(facts, condition));
      const hit = outcomes.every((outcome) => outcome.hit);
      const failed = outcomes.find((outcome) => !outcome.hit);
      const matched = outcomes.find((outcome) => outcome.hit);
      return {
        code: rule.code,
        name: rule.name,
        hit,
        reason: hit
          ? outcomes.map((outcome) => outcome.reason).join("；")
          : (failed?.reason ?? "条件不完整，未判定"),
        matchedQuote: matched?.matchedQuote,
      };
    });
}
