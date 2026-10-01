import assert from "node:assert/strict";
import test from "node:test";
import { deflateRawSync } from "node:zlib";
import { unzip } from "../../src/financial-data/parsers/zip";

/** 构造一个只含单个条目的最小 ZIP（local file header + 数据）。 */
function makeZip(name: string, data: Buffer, declaredUncompressed: number): Buffer {
  const nameBuf = Buffer.from(name, "utf8");
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(0, 12);
  header.writeUInt32LE(0, 14);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt32LE(declaredUncompressed, 22);
  header.writeUInt16LE(nameBuf.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, nameBuf, data]);
}

test("ZIP 正常解压", () => {
  const payload = Buffer.from("hello world");
  const zip = makeZip("a.txt", deflateRawSync(payload), payload.length);
  const entries = unzip(zip);
  assert.equal(entries.get("a.txt")?.toString("utf8"), "hello world");
});

test("声明解压体积过大时拒绝（防解压炸弹）", () => {
  const payload = Buffer.from("hello world");
  const zip = makeZip("bomb.txt", deflateRawSync(payload), 2_000_000_000);
  assert.throws(() => unzip(zip, { maxEntryBytes: 1024 }), /体积过大/);
});

test("实际解压超过单条目上限时拒绝", () => {
  const payload = Buffer.alloc(4096, 1);
  const zip = makeZip("big.txt", deflateRawSync(payload), payload.length);
  assert.throws(() => unzip(zip, { maxEntryBytes: 256 }), /体积过大/);
});
