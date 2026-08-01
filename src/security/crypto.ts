import "server-only";

/**
 * FinOS 数据安全核心（Financial Twin 6.x）—— AES-256-GCM。
 *
 * 职责：
 *  - 密钥派生：FINOS_DATA_KEY 环境变量（任意字符串，scrypt 派生 32 字节密钥）；
 *    未配置时使用固定开发密钥并输出一次性警告（生产必须配置）；
 *  - 定义统一的加密信封（SecurePayload）与类型守卫；
 *  - 加解密原语由 encrypt.ts / decrypt.ts 暴露，业务层不直接触碰 node:crypto。
 *
 * 适用范围：用户敏感财务字段（资产 / 收入 / 负债 / 目标等）落盘前加密。
 */

import { scryptSync } from "node:crypto";

const DEV_FALLBACK_SECRET = "finos-dev-only-secret-do-not-use-in-prod";
const SALT = "finos-security-v1";

/** 统一加密信封：所有加密落盘文件的顶层结构。 */
export interface SecurePayload {
  /** 固定算法标识。 */
  alg: "aes-256-gcm";
  /** 信封版本（预留密钥轮换 / 算法升级）。 */
  v: 1;
  /** 12 字节随机 IV（base64）。 */
  iv: string;
  /** GCM 认证标签（base64）。 */
  tag: string;
  /** 密文（base64）。 */
  data: string;
  /** 加密时间（ISO 8601）。 */
  savedAt: string;
}

let cachedKey: Buffer | null = null;
let warned = false;

/** 派生并缓存 32 字节对称密钥。 */
export function getSecurityKey(): Buffer {
  if (cachedKey) return cachedKey;
  if (!process.env.FINOS_DATA_KEY) {
    // 生产环境绝不允许回退到公开的开发密钥：本项目开源，兜底密钥对所有人可见，
    // 一旦用它加密真实财务数据，等同于未加密。此处必须直接启动失败。
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[security] 生产环境必须配置 FINOS_DATA_KEY 环境变量。" +
          "开发默认密钥是公开的，用于生产将使数据加密完全失效。"
      );
    }
    if (!warned) {
      warned = true;
      console.warn(
        "[security] FINOS_DATA_KEY 未配置，使用开发默认密钥。生产环境必须配置！"
      );
    }
  }
  const secret = process.env.FINOS_DATA_KEY || DEV_FALLBACK_SECRET;
  cachedKey = scryptSync(secret, SALT, 32);
  return cachedKey;
}

/** 判断任意解析结果是否为加密信封（用于旧明文 JSON 的透明迁移）。 */
export function isSecurePayload(value: unknown): value is SecurePayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.alg === "aes-256-gcm" &&
    typeof v.iv === "string" &&
    typeof v.tag === "string" &&
    typeof v.data === "string"
  );
}
