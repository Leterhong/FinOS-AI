import { evaluateRule, type FactCandidate, type RuleCondition } from "./rule-engine";
import { RULE_TEMPLATES } from "./rule-templates";

/**
 * 确定性引擎基准测试（无需大模型）。
 *
 * 对全部规则模板自动生成命中/未命中/边界/单位归一化/防误判/指标别名用例，
 * 用真实的 rule-engine 纯函数判定，输出可复现的准确率指标——
 * 用于证明规则判定逻辑的正确性与覆盖度，不依赖任何模型调用。
 */

export type BenchmarkCategory = "命中判定" | "边界条件" | "单位归一化" | "指标别名" | "防误判";

export interface BenchmarkCase {
  category: BenchmarkCategory;
  name: string;
  condition: RuleCondition;
  fact: FactCandidate;
  expectHit: boolean;
}

export interface BenchmarkFailure {
  category: BenchmarkCategory;
  name: string;
  expectHit: boolean;
  got: boolean;
}

export interface BenchmarkResult {
  total: number;
  passed: number;
  accuracy: number;
  byCategory: Array<{ category: BenchmarkCategory; total: number; passed: number; accuracy: number }>;
  failures: BenchmarkFailure[];
}

type UnitKind = "money" | "percent" | "ratio" | "days";

const ALIAS_PAIRS: Array<[string, string]> = [
  ["经营活动产生的现金流量净额", "经营现金流"],
  ["净资产收益率", "ROE"],
  ["资产负债率", "负债率"],
  ["现金比率", "现金资产比率"],
  ["存货周转率", "存货周转次数"],
  ["利息保障倍数", "已获利息倍数"],
  ["应收账款周转率", "应收周转率"],
  ["速动比率", "酸性测试比率"],
  ["净利率", "销售净利率"],
  ["净利润", "归母净利润"],
];

function unitKind(note: string): UnitKind {
  const token = note.split("；")[0]?.trim() ?? "";
  if (token === "元") return "money";
  if (token === "%") return "percent";
  if (token === "天") return "days";
  return "ratio";
}

function unitOf(kind: UnitKind): string {
  return kind === "money" ? "元" : kind === "percent" ? "%" : kind === "days" ? "天" : "倍";
}

function deltaFor(value: number): number {
  return Math.max(1, Math.abs(value) * 0.1);
}

function hitValue(op: RuleCondition["op"], threshold: number): number {
  const d = deltaFor(threshold);
  switch (op) {
    case "lt":
    case "lte":
      return threshold - d;
    case "gt":
    case "gte":
      return threshold + d;
    case "eq":
      return threshold;
    default:
      return threshold;
  }
}

function missValue(op: RuleCondition["op"], threshold: number): number {
  const d = deltaFor(threshold);
  switch (op) {
    case "lt":
    case "lte":
      return threshold + d;
    case "gt":
    case "gte":
      return threshold - d;
    case "eq":
      return threshold + d;
    default:
      return threshold + d;
  }
}

function boundaryHits(op: RuleCondition["op"]): boolean {
  return op === "lte" || op === "gte" || op === "eq";
}

export function buildBenchmarkCases(): BenchmarkCase[] {
  const cases: BenchmarkCase[] = [];
  for (const template of RULE_TEMPLATES) {
    const kind = unitKind(template.note);
    const unit = unitOf(kind);
    const condition: RuleCondition = { metric: template.metric, op: template.op, value: template.value };
    const inside = hitValue(template.op, template.value);
    const outside = missValue(template.op, template.value);
    const quote = (v: number, u: string) => `基准样例：${template.metric} ${v} ${u}`;

    cases.push({
      category: "命中判定",
      name: `${template.code} 命中`,
      condition,
      fact: { topic: template.metric, value: inside, unit, quote: quote(inside, unit) },
      expectHit: true,
    });
    cases.push({
      category: "命中判定",
      name: `${template.code} 未命中`,
      condition,
      fact: { topic: template.metric, value: outside, unit, quote: quote(outside, unit) },
      expectHit: false,
    });
    cases.push({
      category: "边界条件",
      name: `${template.code} 阈值边界`,
      condition,
      fact: { topic: template.metric, value: template.value, unit, quote: quote(template.value, unit) },
      expectHit: boundaryHits(template.op),
    });
    cases.push({
      category: "防误判",
      name: `${template.code} 无关指标`,
      condition,
      fact: { topic: "无关指标XYZ", value: inside, unit, quote: quote(inside, unit) },
      expectHit: false,
    });
    if (kind === "money") {
      const wan = inside / 10_000;
      cases.push({
        category: "单位归一化",
        name: `${template.code} 万元口径`,
        condition,
        fact: { topic: template.metric, value: wan, unit: "万元", quote: quote(wan, "万元") },
        expectHit: true,
      });
    }
  }

  for (const [metric, alias] of ALIAS_PAIRS) {
    const template = RULE_TEMPLATES.find((item) => item.metric === metric);
    if (!template) continue;
    const kind = unitKind(template.note);
    const unit = unitOf(kind);
    const inside = hitValue(template.op, template.value);
    cases.push({
      category: "指标别名",
      name: `${metric} ← ${alias}`,
      condition: { metric: template.metric, op: template.op, value: template.value },
      fact: { topic: alias, value: inside, unit, quote: `基准样例：${alias} ${inside} ${unit}` },
      expectHit: true,
    });
  }

  return cases;
}

export function runRuleBenchmark(): BenchmarkResult {
  const cases = buildBenchmarkCases();
  const categories: BenchmarkCategory[] = ["命中判定", "边界条件", "单位归一化", "指标别名", "防误判"];
  const agg = new Map<BenchmarkCategory, { total: number; passed: number }>();
  const failures: BenchmarkFailure[] = [];
  let passed = 0;

  for (const testCase of cases) {
    const got = evaluateRule([testCase.fact], testCase.condition).hit;
    const ok = got === testCase.expectHit;
    if (ok) passed += 1;
    else failures.push({ category: testCase.category, name: testCase.name, expectHit: testCase.expectHit, got });
    const bucket = agg.get(testCase.category) ?? { total: 0, passed: 0 };
    bucket.total += 1;
    if (ok) bucket.passed += 1;
    agg.set(testCase.category, bucket);
  }

  return {
    total: cases.length,
    passed,
    accuracy: cases.length ? passed / cases.length : 0,
    byCategory: categories
      .filter((category) => agg.has(category))
      .map((category) => {
        const bucket = agg.get(category)!;
        return { category, total: bucket.total, passed: bucket.passed, accuracy: bucket.total ? bucket.passed / bucket.total : 0 };
      }),
    failures,
  };
}
