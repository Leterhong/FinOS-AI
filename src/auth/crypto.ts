import "server-only";

/**
 * 认证加密层（Phase 5.6）—— 仅服务端。
 *  - 密码哈希：scrypt + 每用户随机盐（区别于金融数据加密的 FINOS_DATA_KEY）；
 *  - Session Token：HMAC-SHA256 签名的紧凑 token，无第三方 JWT 依赖。
 * 密钥来源：FINOS_AUTH_SECRET 环境变量；未配置时使用固定开发密钥并告警（生产必须配置）。
 */

import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHmac,
} from "node:crypto";

import { resolveSecretOrThrow } from "@/security/secret-guard";
import type { SessionPayload } from "./types";

const DEV_FALLBACK_SECRET = "finos-dev-only-auth-secret-do-not-use-in-prod";
const SCRYPT_KEYLEN = 64;
/** Session 有效期：7 天。 */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

let warned = false;

function getAuthSecret(): string {
  const raw = process.env.FINOS_AUTH_SECRET || process.env.FINOS_DATA_KEY;
  const secret = resolveSecretOrThrow(raw, "auth", DEV_FALLBACK_SECRET);
  if (!raw && process.env.NODE_ENV !== "production" && !warned) {
    warned = true;
    console.warn("[auth] FINOS_AUTH_SECRET 未配置，使用开发默认密钥。生产环境必须配置！");
  }
  return secret;
}

/* ------------------------------------------------------------------ */
/* 密码哈希                                                            */
/* ------------------------------------------------------------------ */

/** 生成密码哈希与随机盐（均为 hex）。 */
export function hashPassword(plain: string): {
  passwordHash: string;
  passwordSalt: string;
} {
  const salt = randomBytes(16);
  const derived = scryptSync(plain, salt, SCRYPT_KEYLEN);
  return {
    passwordHash: derived.toString("hex"),
    passwordSalt: salt.toString("hex"),
  };
}

/** 校验明文密码是否匹配（常量时间比较）。 */
export function verifyPassword(
  plain: string,
  passwordHash: string,
  passwordSalt: string
): boolean {
  try {
    const salt = Buffer.from(passwordSalt, "hex");
    const derived = scryptSync(plain, salt, SCRYPT_KEYLEN);
    const stored = Buffer.from(passwordHash, "hex");
    if (stored.length !== derived.length) return false;
    return timingSafeEqual(stored, derived);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Session Token（HMAC 签名）                                          */
/* ------------------------------------------------------------------ */

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64url(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

/** 生成签名后的 session token：{base64url(payload)}.{base64url(hmac)} */
export function signSession(input: { userId: string; email: string }): string {
  const now = Date.now();
  const payload: SessionPayload = {
    userId: input.userId,
    email: input.email,
    iat: now,
    exp: now + SESSION_TTL_MS,
  };
  const body = base64url(JSON.stringify(payload));
  const sig = createHmac("sha256", getAuthSecret()).update(body).digest();
  return `${body}.${base64url(sig)}`;
}

/** 校验并解析 session token，失败或过期返回 null。 */
export function verifySession(token: string): SessionPayload | null {
  try {
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    const expected = createHmac("sha256", getAuthSecret())
      .update(body)
      .digest();
    const actual = fromBase64url(sig);
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      return null;
    }
    const payload = JSON.parse(
      fromBase64url(body).toString("utf8")
    ) as SessionPayload;
    if (!payload.userId || !payload.exp || Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export { SESSION_TTL_MS };
