import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { runRuleBenchmark } from "../src/lib/engine-benchmark";
import { RULE_TEMPLATES, ruleTemplateGroups } from "../src/lib/rule-templates";
import { DIMENSIONLESS_UNITS, UNIT_TO_YUAN } from "../src/lib/units";

/**
 * 生成确定性引擎评测报告（docs/benchmark.md）。
 * 运行：npm run benchmark
 */
const result = runRuleBenchmark();
const groups = ruleTemplateGroups();
const accuracy = (result.accuracy * 100).toFixed(1);

const lines: string[] = [];
lines.push("# FinOS AI 确定性引擎评测报告");
lines.push("");
lines.push("> 本报告由 `npm run benchmark` 生成。全部为确定性规则引擎的纯函数判定，不调用任何大模型、不依赖网络，结果可复现。");
lines.push("");
lines.push(`生成时间：${new Date().toISOString()}`);
lines.push("");
lines.push("## 总览");
lines.push("");
lines.push("| 指标 | 数值 |");
lines.push("| --- | --- |");
lines.push(`| 规则模板 | ${RULE_TEMPLATES.length} 条，覆盖 ${groups.length} 个分组 |`);
lines.push(`| 基准用例 | ${result.total} 条 |`);
lines.push(`| 通过 | ${result.passed} 条 |`);
lines.push(`| 准确率 | ${accuracy}% |`);
lines.push(`| 货币单位 | ${Object.keys(UNIT_TO_YUAN).length} 种 |`);
lines.push(`| 无量纲 / 时间单位 | ${DIMENSIONLESS_UNITS.size} 种 |`);
lines.push("");
lines.push("## 分类结果");
lines.push("");
lines.push("| 类别 | 用例 | 通过 | 准确率 |");
lines.push("| --- | --- | --- | --- |");
for (const category of result.byCategory) {
  lines.push(`| ${category.category} | ${category.total} | ${category.passed} | ${(category.accuracy * 100).toFixed(1)}% |`);
}
lines.push("");
lines.push("## 评测方法");
lines.push("");
lines.push("- 依据全部规则模板自动生成用例：命中、未命中、阈值边界、金额单位归一化（万元 → 元）、指标别名、无关指标防误判。");
lines.push("- 判定调用生产同款 `evaluateRule` 纯函数，同一输入永远得到同一结论。");
lines.push("- 边界语义：`<` / `>` 在等于阈值时不命中；`≤` / `≥` / `=` 在等于阈值时命中。");
lines.push("- 单位口径：货币单位换算为元；比率 / 时间类（%、倍、天等）保留原值；未知单位返回 NaN 且不命中。");
lines.push("");
lines.push("## 结论");
lines.push("");
if (result.failures.length === 0) {
  lines.push("全部用例通过。规则命中判定、阈值边界、单位归一化与指标别名口径保持一致，可复现、可审计。");
} else {
  lines.push(`存在 ${result.failures.length} 条失败用例，需要修复：`);
  lines.push("");
  for (const failure of result.failures.slice(0, 20)) {
    lines.push(`- [${failure.category}] ${failure.name}：期望命中=${failure.expectHit}，实际=${failure.got}`);
  }
}
lines.push("");

const output = join(process.cwd(), "docs", "benchmark.md");
writeFileSync(output, lines.join("\n"), "utf8");
console.log(`benchmark: ${result.passed}/${result.total} 通过（准确率 ${accuracy}%）-> docs/benchmark.md`);
if (result.failures.length) {
  console.error(JSON.stringify(result.failures.slice(0, 10), null, 2));
  process.exit(1);
}
