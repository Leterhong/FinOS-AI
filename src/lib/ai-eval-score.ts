import { canonicalMetricName } from "./metric-aliases";

/**
 * AI 事实抽取评测的评分逻辑（纯函数，可单测）。
 * 输入：标注用例（期望事实）+ 模型预测事实；输出：精确率/召回率/F1、单位正确率、引用有效性。
 * 引用有效性 = 预测事实的 quote 能在原文中找到（防止编造证据），是幻觉的确定性代理指标。
 */

export interface EvalExpectedFact {
  topic: string;
  value: number;
  unit: string;
}

export interface EvalPredictedFact {
  topic: string;
  value: number;
  unit: string;
  quote?: string;
}

export interface EvalCase {
  id: string;
  text: string;
  expected: EvalExpectedFact[];
}

export interface EvalPrediction {
  id: string;
  facts: EvalPredictedFact[];
}

export interface EvalCaseResult {
  id: string;
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  missingTopics: string[];
  extraTopics: string[];
}

export interface ExtractionMetrics {
  cases: number;
  expectedTotal: number;
  predictedTotal: number;
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  precision: number;
  recall: number;
  f1: number;
  unitCorrectRate: number;
  citationValidRate: number;
  perCase: EvalCaseResult[];
}

function normalizeText(value: string): string {
  return (value || "").replace(/[\s（）()【】[\]:：、，,。.；;"'“”‘’·-]/g, "");
}

function valueClose(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / scale <= 0.02;
}

function unitEqual(a: string, b: string): boolean {
  const norm = (value: string) => (value || "").trim().replace(/％/g, "%").replace(/^人民币/, "");
  return norm(a) === norm(b);
}

function sameTopic(a: string, b: string): boolean {
  const ca = canonicalMetricName(a);
  const cb = canonicalMetricName(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  const shorter = ca.length <= cb.length ? ca : cb;
  const longer = ca.length <= cb.length ? cb : ca;
  return shorter.length >= 3 && longer.includes(shorter);
}

const ratio = (numerator: number, denominator: number): number => (denominator > 0 ? numerator / denominator : 0);

export function scoreExtraction(cases: EvalCase[], predictions: EvalPrediction[]): ExtractionMetrics {
  const byId = new Map(predictions.map((prediction) => [prediction.id, prediction.facts]));
  const perCase: EvalCaseResult[] = [];
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let expectedTotal = 0;
  let predictedTotal = 0;
  let matched = 0;
  let matchedUnitCorrect = 0;
  let citationChecked = 0;
  let citationValid = 0;

  for (const evalCase of cases) {
    const facts = byId.get(evalCase.id) ?? [];
    const used = new Array(facts.length).fill(false);
    let caseTp = 0;
    const missingTopics: string[] = [];
    expectedTotal += evalCase.expected.length;

    for (const expected of evalCase.expected) {
      const index = facts.findIndex(
        (fact, i) => !used[i] && sameTopic(fact.topic, expected.topic) && valueClose(Number(fact.value), expected.value),
      );
      if (index === -1) {
        missingTopics.push(expected.topic);
        falseNegative += 1;
        continue;
      }
      used[index] = true;
      caseTp += 1;
      truePositive += 1;
      matched += 1;
      if (unitEqual(facts[index].unit, expected.unit)) matchedUnitCorrect += 1;
    }

    const extraTopics: string[] = [];
    facts.forEach((fact, i) => {
      if (!used[i]) {
        extraTopics.push(fact.topic);
        falsePositive += 1;
      }
      // 引用有效性：quote 必须在原文可定位（去除空白与标点后包含）。
      const quote = normalizeText(fact.quote ?? "");
      if (quote.length >= 4) {
        citationChecked += 1;
        if (normalizeText(evalCase.text).includes(quote)) citationValid += 1;
      }
    });
    predictedTotal += facts.length;
    perCase.push({ id: evalCase.id, truePositive: caseTp, falsePositive: extraTopics.length, falseNegative: missingTopics.length, missingTopics, extraTopics });
  }

  const precision = ratio(truePositive, truePositive + falsePositive);
  const recall = ratio(truePositive, truePositive + falseNegative);
  return {
    cases: cases.length,
    expectedTotal,
    predictedTotal,
    truePositive,
    falsePositive,
    falseNegative,
    precision,
    recall,
    f1: precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0,
    unitCorrectRate: ratio(matchedUnitCorrect, matched),
    citationValidRate: ratio(citationValid, citationChecked),
    perCase,
  };
}
