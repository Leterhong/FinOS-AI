import assert from "node:assert/strict";
import test from "node:test";

import { buildBenchmarkCases, runRuleBenchmark } from "../../src/lib/engine-benchmark";

test("确定性引擎基准测试全部通过且用例充足", () => {
  const result = runRuleBenchmark();
  assert.ok(result.total >= 200, `用例数应充足，实际 ${result.total}`);
  assert.equal(
    result.passed,
    result.total,
    `存在失败用例: ${JSON.stringify(result.failures.slice(0, 5))}`,
  );
  assert.equal(result.accuracy, 1);
});

test("基准覆盖命中/边界/单位归一化/别名/防误判五类", () => {
  const categories = new Set(buildBenchmarkCases().map((item) => item.category));
  for (const category of ["命中判定", "边界条件", "单位归一化", "指标别名", "防误判"] as const) {
    assert.ok(categories.has(category), `缺少基准类别 ${category}`);
  }
});
