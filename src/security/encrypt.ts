import "server-only";

/**
 * 加密入口（Financial Twin 6.x）。
 * 业务层调用 encryptJson 将任意 JSON 可序列化对象封装为 SecurePayload，
 * 再序列化落盘；密钥与信封定义见 crypto.ts。
 */

import { createCipheriv, randomBytes } from "node:crypto";
import { getSecurityKey, type SecurePayload } from "./crypto";

/** 加密任意 JSON 可序列化对象为统一加密信封。 */
export function encryptJson(data: unknown): SecurePayload {
  const key = getSecurityKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(data), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    alg: "aes-256-gcm",
    v: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: encrypted.toString("base64"),
    savedAt: new Date().toISOString(),
  };
}

/** 加密并序列化为可直接写盘的字符串。 */
export function encryptToFileString(data: unknown): string {
  return JSON.stringify(encryptJson(data), null, 2);
}
