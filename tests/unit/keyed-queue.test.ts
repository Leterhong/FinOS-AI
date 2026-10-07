import assert from "node:assert/strict";
import test from "node:test";

import { KeyedQueue } from "../../src/lib/keyed-queue";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test("同一 key 串行执行，不同 key 可并行", async () => {
  const queue = new KeyedQueue();
  const order: string[] = [];
  const first = queue.run("a", async () => {
    order.push("a1-start");
    await new Promise((resolve) => setTimeout(resolve, 20));
    order.push("a1-end");
    return 1;
  });
  const second = queue.run("a", async () => {
    order.push("a2");
    return 2;
  });
  const third = queue.run("b", async () => {
    order.push("b");
    return 3;
  });
  assert.deepEqual(await Promise.all([first, second, third]), [1, 2, 3]);
  assert.ok(order.indexOf("a1-end") < order.indexOf("a2"), "同 key 操作必须串行");
});

test("队列排空后自动清理 key", async () => {
  const queue = new KeyedQueue();
  await Promise.all(Array.from({ length: 50 }, (_, i) => queue.run(`k${i}`, async () => i)));
  await tick();
  assert.equal(queue.size, 0);
});

test("操作抛错后队列仍可继续且最终被清理", async () => {
  const queue = new KeyedQueue();
  await assert.rejects(queue.run("x", async () => {
    throw new Error("boom");
  }));
  assert.equal(await queue.run("x", async () => 42), 42);
  await tick();
  assert.equal(queue.size, 0);
});
