import "server-only";

/**
 * 解密入口（Financial Twin 6.x）。
 *  - decryptJson：解开 SecurePayload 信封，认证失败抛异常；
 *  - parseSecureFileString：读盘字符串 → 对象。兼容历史明文 JSON：
 *    若内容不是加密信封则按明文解析并标记 migrated，由调用方回写加密副本，
 *    实现「读取即透明迁移」，不破坏既有用户数据。
 */

import { createDecipheriv } from "node:crypto";
import { getSecurityKey, isSecurePayload, type SecurePayload } from "./crypto";

/** 解密统一加密信封，失败抛出异常（认证标签不匹配 / 密钥错误 / 数据损坏）。 */
export function decryptJson<T>(blob: SecurePayload): T {
  const key = getSecurityKey();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(blob.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(blob.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(blob.data, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8")) as T;
}

/** parseSecureFileString 的解析结果。 */
export interface SecureParseResult<T> {
  value: T;
  /** true = 源文件是历史明文 JSON，调用方应回写加密副本完成迁移。 */
  migrated: boolean;
}

/**
 * 解析磁盘文件内容（加密信封或历史明文 JSON）。
 * 返回 null 表示内容损坏 / 无法解析（调用方视为不存在）。
 */
export function parseSecureFileString<T>(raw: string): SecureParseResult<T> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (isSecurePayload(parsed)) {
    try {
      return { value: decryptJson<T>(parsed), migrated: false };
    } catch {
      return null;
    }
  }
  // 历史明文 JSON：按原样返回并标记需要迁移
  return { value: parsed as T, migrated: true };
}
