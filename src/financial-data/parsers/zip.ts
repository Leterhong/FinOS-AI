import "server-only";

/**
 * 最小 ZIP 读取器 —— 仅用于解压 xlsx（Office Open XML 本质是 ZIP）。
 * 支持 store(0) 与 deflate(8) 两种压缩方式，读取本地文件头。
 * 依赖 node:zlib 的 inflateRawSync。
 */

import { inflateRawSync } from "node:zlib";

export interface UnzipLimits {
  /** 单条目解压后最大字节数。 */
  maxEntryBytes?: number;
  /** 全部条目解压后累计最大字节数（防解压炸弹）。 */
  maxTotalBytes?: number;
  /** 最多解压的条目数。 */
  maxEntries?: number;
}

const DEFAULT_MAX_ENTRY_BYTES = 20 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 40 * 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 200;

/** 从 ZIP buffer 中解出所有条目；超出体积/条目上限时抛错，避免解压炸弹打爆内存。 */
export function unzip(buf: Buffer, limits: UnzipLimits = {}): Map<string, Buffer> {
  const maxEntryBytes = limits.maxEntryBytes ?? DEFAULT_MAX_ENTRY_BYTES;
  const maxTotalBytes = limits.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const maxEntries = limits.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const entries = new Map<string, Buffer>();
  let totalBytes = 0;
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

    // 先按头部声明的大小拦截：声明的解压体积过大直接拒绝整包。
    if (uncompSize > maxEntryBytes) {
      throw new Error("压缩包内单个文件解压后体积过大，已拒绝");
    }
    if (method === 0 && entrySize > maxEntryBytes) {
      throw new Error("压缩包内单个文件体积过大，已拒绝");
    }

    const raw = buf.subarray(dataStart, dataStart + entrySize);
    try {
      let data: Buffer;
      if (method === 0) {
        data = Buffer.from(raw);
      } else if (method === 8) {
        // maxOutputLength 在解压过程中强制上限，超限即抛错，避免先分配再校验。
        data = inflateRawSync(raw, { maxOutputLength: maxEntryBytes });
      } else {
        offset = dataStart + entrySize;
        continue;
      }
      if (data.length > maxEntryBytes) {
        throw new Error("压缩包内单个文件解压后体积过大，已拒绝");
      }
      totalBytes += data.length;
      if (totalBytes > maxTotalBytes) {
        throw new Error("压缩包解压后总体积过大，已拒绝");
      }
      if (entries.size >= maxEntries) {
        throw new Error("压缩包内文件过多，已拒绝");
      }
      entries.set(name, data);
    } catch (error) {
      // 体积类错误必须向上抛出；其它损坏条目跳过，不影响其他条目。
      if (error instanceof Error && error.message.includes("已拒绝")) throw error;
    }

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
