import "server-only";

/**
 * API Key 加密（Phase 5.5 四）—— AES-256-GCM（node:crypto）。
 * 禁止明文保存 API Key：持久化只保存 encryptApiKey() 产出的密文结构。
 * 密钥来源：FINOS_DATA_KEY 环境变量（经 scrypt 派生 32 字节），
 * 未配置时降级为开发默认密钥并告警（生产必须配置）。
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import type { EncryptedApiKey } from "../types";

const DEV_FALLBACK_SECRET = "finos-dev-only-secret-do-not-use-in-prod";
const SALT = "finos-model-center-v1";

let cachedKey: Buffer | null = null;
let warned = false;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  if (!process.env.FINOS_DATA_KEY) {
    // 生产环境禁止用公开的开发密钥加密用户的模型 API Key。
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[model-center] 生产环境必须配置 FINOS_DATA_KEY 环境变量。" +
          "开发默认密钥是公开的，用它加密用户 API Key 等同于明文存储。"
      );
    }
    if (!warned) {
      warned = true;
      console.warn(
        "[model-center] FINOS_DATA_KEY 未配置，API Key 使用开发默认密钥加密。生产环境必须配置！"
      );
    }
  }
  const secret = process.env.FINOS_DATA_KEY || DEV_FALLBACK_SECRET;
  cachedKey = scryptSync(secret, SALT, 32);
  return cachedKey;
}

/** 加密 API Key 明文 → 密文结构（禁止明文落盘）。 */
export function encryptApiKey(plain: string): EncryptedApiKey {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plain, "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64"),
  };
}

/** 解密 API Key 密文 → 明文（仅服务端内存使用，失败抛异常）。 */
export function decryptApiKey(blob: EncryptedApiKey): string {
  const key = getKey();
  const iv = Buffer.from(blob.iv, "base64");
  const tag = Buffer.from(blob.tag, "base64");
  const data = Buffer.from(blob.data, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * 掩码 API Key 用于前端展示：sk-abcd****wxyz。
 * 短 key 仅保留首尾各 2 位，避免泄露。
 */
export function maskApiKey(plain: string | undefined): string {
  if (!plain) return "—";
  const s = plain.trim();
  if (s.length <= 8) {
    const head = s.slice(0, 2);
    return `${head}${"*".repeat(Math.max(4, s.length - 2))}`;
  }
  const head = s.slice(0, 4);
  const tail = s.slice(-4);
  return `${head}****${tail}`;
}
