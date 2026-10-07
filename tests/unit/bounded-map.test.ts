import assert from "node:assert/strict";
import test from "node:test";

import { BoundedMap } from "../../src/lib/bounded-map";

test("超过容量上限时淘汰最旧键", () => {
  const map = new BoundedMap<string, number>(2);
  map.set("a", 1);
  map.set("b", 2);
  map.set("c", 3);
  assert.equal(map.size, 2);
  assert.equal(map.has("a"), false);
  assert.equal(map.get("b"), 2);
  assert.equal(map.get("c"), 3);
});

test("touch 命中并刷新为最新，淘汰更旧的键", () => {
  const map = new BoundedMap<string, number>(2);
  map.set("a", 1);
  map.set("b", 2);
  assert.equal(map.touch("a"), 1);
  map.set("c", 3);
  assert.equal(map.has("a"), true);
  assert.equal(map.has("b"), false);
  assert.equal(map.size, 2);
});

test("覆盖已有键不会扩大占用", () => {
  const map = new BoundedMap<string, number>(2);
  map.set("a", 1);
  map.set("b", 2);
  map.set("a", 9);
  assert.equal(map.size, 2);
  assert.equal(map.get("a"), 9);
});
