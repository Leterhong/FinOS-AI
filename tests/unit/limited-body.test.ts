import assert from "node:assert/strict";
import test from "node:test";

import { readBodyWithLimit } from "../../src/lib/limited-body";

test("正常读取未超限的请求体", async () => {
  const req = new Request("http://localhost/x", { method: "POST", body: "hello=world" });
  const result = await readBodyWithLimit(req, 1024);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.text, "hello=world");
});

test("超过字节上限时返回 too_large", async () => {
  const req = new Request("http://localhost/x", { method: "POST", body: "a".repeat(100) });
  const result = await readBodyWithLimit(req, 10);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, "too_large");
});

test("按字节而非字符计数（多字节 UTF-8）", async () => {
  const body = "测试测试"; // 4 个汉字 = 12 字节
  const tooSmall = await readBodyWithLimit(
    new Request("http://localhost/x", { method: "POST", body }),
    11,
  );
  assert.equal(tooSmall.ok, false);
  const exact = await readBodyWithLimit(
    new Request("http://localhost/x", { method: "POST", body }),
    12,
  );
  assert.equal(exact.ok, true);
  assert.equal(exact.ok && exact.text, body);
});

test("无请求体返回空字符串", async () => {
  const req = new Request("http://localhost/x", { method: "POST" });
  const result = await readBodyWithLimit(req, 10);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.text, "");
});
