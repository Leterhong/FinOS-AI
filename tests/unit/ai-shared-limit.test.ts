import assert from "node:assert/strict";
import test from "node:test";

import { allowSharedModelCall, clientIpFromHeaders } from "../../src/lib/ai-shared-limit";

test("clientIpFromHeaders 解析 X-Forwarded-For 首段", () => {
  assert.equal(clientIpFromHeaders(new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" })), "1.2.3.4");
  assert.equal(clientIpFromHeaders(new Headers({ "x-real-ip": "9.9.9.9" })), "9.9.9.9");
  assert.equal(clientIpFromHeaders(new Headers()), "unknown");
});

test("无 Redis 时进程内计数：超过每分钟配额返回 false", async () => {
  const saved = { ...process.env };
  delete process.env.REDIS_URL;
  process.env.AI_SHARED_RATE_LIMIT_PER_MINUTE = "2";
  const ip = `test-${Date.now()}-${Math.random()}`;
  try {
    assert.equal(await allowSharedModelCall(ip), true);
    assert.equal(await allowSharedModelCall(ip), true);
    assert.equal(await allowSharedModelCall(ip), false);
  } finally {
    process.env = saved;
  }
});
