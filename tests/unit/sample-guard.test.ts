import assert from "node:assert/strict";
import test from "node:test";

import { shouldSyncEntityId } from "../../src/lib/sample-guard";

test("示例数据 id 不同步到服务端，真实数据正常同步", () => {
  assert.equal(shouldSyncEntityId("SAMPLE-CASE-1"), false);
  assert.equal(shouldSyncEntityId("SAMPLE-RISK-1"), false);
  assert.equal(shouldSyncEntityId("CASE-ABC123"), true);
  assert.equal(shouldSyncEntityId("RISK-1"), true);
  assert.equal(shouldSyncEntityId(undefined), true);
  assert.equal(shouldSyncEntityId(""), true);
});
