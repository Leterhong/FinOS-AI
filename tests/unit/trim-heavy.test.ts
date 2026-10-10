import assert from "node:assert/strict";
import test from "node:test";

import { capTables, capText } from "../../src/lib/trim-heavy";

test("capText 截断超长文本，非字符串返回 undefined", () => {
  assert.equal(capText("abc", 10), "abc");
  assert.equal(capText("abcdefghij", 4), "abcd");
  assert.equal(capText(undefined, 10), undefined);
  assert.equal(capText(null, 10), undefined);
});

test("capTables 同时限制张数与每张行数", () => {
  const tables = Array.from({ length: 3 }, (_, i) => ({
    name: `t${i}`,
    rows: Array.from({ length: 5 }, (_, j) => ({ v: j })),
  }));
  const capped = capTables(tables, 2, 3);
  assert.equal(capped?.length, 2);
  assert.equal(capped?.[0].rows?.length, 3);
  assert.deepEqual(capped?.[0].rows?.[0], { v: 0 });
});

test("capTables 处理空值与缺省 rows", () => {
  assert.equal(capTables(undefined), undefined);
  assert.deepEqual(capTables([]), []);
  const noRows = capTables([{ name: "x" } as { rows?: unknown[] }]);
  assert.deepEqual(noRows, [{ name: "x" }]);
});
