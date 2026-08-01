import "server-only";

/**
 * 最小 ZIP 读取器 —— 仅用于解压 xlsx（Office Open XML 本质是 ZIP）。
 * 支持 store(0) 与 deflate(8) 两种压缩方式，读取本地文件头。
 * 依赖 node:zlib 的 inflateRawSync。
 */

import { inflateRawSync } from "node:zlib";

/** 从 ZIP buffer 中解出所有条目 */
export function unzip(buf: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  const SIG = 0x04034b50; // local file header signature

  let offset = 0;
  while (offset + 30 <= buf.length) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== SIG) break;

    const method = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const uncompSize = buf.readUInt32LE(offset + 22);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const flags = buf.readUInt16LE(offset + 6);

    const nameStart = offset + 30;
    const name = buf.toString("utf8", nameStart, nameStart + nameLen);
    const dataStart = nameStart + nameLen + extraLen;

    // bit 3: 数据描述符在数据之后，compSize 可能为 0 —— 保守跳过
    const hasDataDescriptor = (flags & 0x08) !== 0;
    let entrySize = compSize;

    if (hasDataDescriptor && compSize === 0) {
      // 无法从头部得知大小，回退：整体扫描下一个签名。较少见，尽力处理。
      const next = findNextSignature(buf, dataStart);
      entrySize = (next === -1 ? buf.length : next) - dataStart;
    }

    const raw = buf.subarray(dataStart, dataStart + entrySize);
    try {
      let data: Buffer;
      if (method === 0) {
        data = Buffer.from(raw);
      } else if (method === 8) {
        data = inflateRawSync(raw);
      } else {
        offset = dataStart + entrySize;
        continue;
      }
      entries.set(name, data);
    } catch {
      // 单条目解压失败不影响其他条目
    }

    void uncompSize;
    offset = dataStart + entrySize;
  }

  return entries;
}

function findNextSignature(buf: Buffer, from: number): number {
  for (let i = from; i + 4 <= buf.length; i++) {
    const sig = buf.readUInt32LE(i);
    // local file header 或 central directory header
    if (sig === 0x04034b50 || sig === 0x02014b50) return i;
  }
  return -1;
}
