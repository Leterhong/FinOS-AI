import "server-only";

/**
 * 金融数据加密 —— AES-256-GCM（node:crypto）。
 * 密钥来源：FINOS_DATA_KEY 环境变量（任意字符串，经 scrypt 派生 32 字节密钥）。
 * 未配置时使用固定开发密钥并输出警告（生产必须配置）。
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

import { resolveSecretOrThrow } from "@/security/secret-guard";
import type { EncryptedBlob } from "../types";

const DEV_FALLBACK_SECRET = "finos-dev-only-secret-do-not-use-in-prod";
const SALT = "finos-financial-data-v1";

let cachedKey: Buffer | null = null;
let warned = false;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = resolveSecretOrThrow(process.env.FINOS_DATA_KEY, "financial-data", DEV_FALLBACK_SECRET);
  if (!process.env.FINOS_DATA_KEY && process.env.NODE_ENV !== "production" && !warned) {
    warned = true;
    console.warn("[financial-data] FINOS_DATA_KEY 未配置，使用开发默认密钥。生产环境必须配置！");
  }
  cachedKey = scryptSync(secret, SALT, 32);
  return cachedKey;
}

/** 加密任意 JSON 可序列化对象 */
export function encryptJson(data: unknown): EncryptedBlob {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(data), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
    savedAt: new Date().toISOString(),
  };
}

/** 解密为对象，失败抛出异常 */
export function decryptJson<T>(blob: EncryptedBlob): T {
  const key = getKey();
  const iv = Buffer.from(blob.iv, "base64");
  const tag = Buffer.from(blob.tag, "base64");
  const data = Buffer.from(blob.data, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8")) as T;
}
